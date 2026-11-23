import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, In } from 'typeorm';
import { OutboxEvent, type OutboxPayload } from './outbox-event.entity';
import { DOMAIN_EVENTS_QUEUE } from './outbox.service';

export interface DomainEventJob {
  eventId: string;
  organizationId: string | null;
  payload: OutboxPayload;
}

/**
 * Moves committed outbox rows onto the BullMQ domain-events queue.
 *
 * `FOR UPDATE SKIP LOCKED` lets several worker replicas relay concurrently without double work,
 * and the BullMQ jobId equals the event id, so a crash between enqueue and commit cannot create a
 * duplicate job (BullMQ ignores adds for an existing jobId). Delivery is at-least-once; handlers
 * must be idempotent.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectQueue(DOMAIN_EVENTS_QUEUE) private readonly queue: Queue<DomainEventJob>,
  ) {}

  async relayBatch(limit = 100): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const events = await manager
        .createQueryBuilder(OutboxEvent, 'e')
        .where('e.published_at IS NULL')
        .orderBy('e.created_at', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      if (events.length === 0) return 0;

      await this.queue.addBulk(
        events.map((event) => ({
          name: event.type,
          data: { eventId: event.id, organizationId: event.organizationId, payload: event.payload },
          opts: {
            jobId: event.id,
            attempts: 8,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { age: 24 * 3600 },
            removeOnFail: { age: 7 * 24 * 3600 },
          },
        })),
      );
      await manager.update(
        OutboxEvent,
        { id: In(events.map((e) => e.id)) },
        { publishedAt: new Date() },
      );
      this.logger.debug(`relayed ${events.length} outbox event(s)`);
      return events.length;
    });
  }
}
