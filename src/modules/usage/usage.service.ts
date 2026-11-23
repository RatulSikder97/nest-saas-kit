import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { Between } from 'typeorm';
import { REDIS } from '../../redis/redis.constants';
import { TenancyService } from '../../tenancy/tenancy.service';
import { UsageRecord } from './usage-record.entity';

export const LIVE_PREFIX = 'usage:live:';
export const FLUSH_PREFIX = 'usage:flush:';
export const METRIC_API_REQUESTS = 'api_requests';
const LIVE_KEY_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface UsageSummary {
  from: string;
  to: string;
  /** Persisted counters per day and metric. */
  records: Array<Pick<UsageRecord, 'period' | 'metric' | 'quantity'>>;
  /** Counters still buffered in Redis (not yet flushed). */
  pending: Record<string, number>;
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Hot-path metering writes a Redis hash increment per request (O(1), no DB write); the worker's
 * flush job periodically drains the hashes into Postgres.
 *
 * Exactly-once flush: a live key is atomically RENAMEd to a uniquely named batch key, and the
 * batch id is inserted into usage_flush_batches in the same DB transaction as the counter upsert.
 * If the process dies after commit but before deleting the batch key, the retry sees the batch id
 * and only deletes the key.
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly tenancy: TenancyService,
  ) {}

  async increment(organizationId: string, metric: string, by = 1): Promise<void> {
    const key = `${LIVE_PREFIX}${organizationId}:${utcDay()}`;
    await this.redis.multi().hincrby(key, metric, by).expire(key, LIVE_KEY_TTL_SECONDS).exec();
  }

  async summary(from: string, to: string): Promise<UsageSummary> {
    const organizationId = this.tenancy.organizationId();
    const records = await this.tenancy.manager().find(UsageRecord, {
      where: { organizationId, period: Between(from, to) },
      order: { period: 'ASC', metric: 'ASC' },
    });
    const pending: Record<string, number> = {};
    const day = utcDay();
    if (day >= from && day <= to) {
      const live = await this.redis.hgetall(`${LIVE_PREFIX}${organizationId}:${day}`);
      for (const [metric, value] of Object.entries(live)) pending[metric] = Number(value);
    }
    return {
      from,
      to,
      records: records.map(({ period, metric, quantity }) => ({ period, metric, quantity })),
      pending,
    };
  }

  /** Drains all buffered counters into Postgres. Returns the number of batches flushed. */
  async flush(): Promise<number> {
    let flushed = 0;
    // Leftover batches from a crashed run first, then current live keys.
    for (const key of await this.scan(`${FLUSH_PREFIX}*`)) {
      if (await this.flushBatch(key)) flushed++;
    }
    for (const liveKey of await this.scan(`${LIVE_PREFIX}*`)) {
      const suffix = liveKey.slice(LIVE_PREFIX.length);
      const batchKey = `${FLUSH_PREFIX}${suffix}:${randomUUID()}`;
      try {
        await this.redis.rename(liveKey, batchKey);
      } catch (err) {
        // Key vanished between SCAN and RENAME (e.g. another flusher took it): nothing to do.
        if (err instanceof Error && err.message.includes('no such key')) continue;
        throw err;
      }
      if (await this.flushBatch(batchKey)) flushed++;
    }
    return flushed;
  }

  private async flushBatch(batchKey: string): Promise<boolean> {
    // usage:flush:<orgId>:<yyyy-mm-dd>:<batchId>
    const [organizationId, period, batchId] = batchKey.slice(FLUSH_PREFIX.length).split(':');
    if (!organizationId || !period || !batchId) {
      this.logger.error(`malformed usage batch key ${batchKey}; leaving it for inspection`);
      return false;
    }
    const counters = await this.redis.hgetall(batchKey);
    const entries = Object.entries(counters).filter(([, v]) => Number(v) > 0);
    await this.tenancy.run({ organizationId }, async (manager) => {
      const inserted: unknown[] = await manager.query(
        `INSERT INTO usage_flush_batches (batch_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING batch_id`,
        [batchId],
      );
      if (inserted.length === 0) return; // already applied by a previous attempt
      for (const [metric, value] of entries) {
        await manager.query(
          `INSERT INTO usage_records (organization_id, period, metric, quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (organization_id, period, metric)
           DO UPDATE SET quantity = usage_records.quantity + EXCLUDED.quantity, updated_at = now()`,
          [organizationId, period, metric, Number(value)],
        );
      }
    });
    await this.redis.del(batchKey);
    return true;
  }

  private async scan(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      keys.push(...batch);
      cursor = next;
    } while (cursor !== '0');
    return keys;
  }
}
