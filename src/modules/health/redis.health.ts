import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS } from '../../redis/redis.constants';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly health: HealthIndicatorService,
  ) {}

  async check(key = 'redis'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? indicator.up() : indicator.down({ reply: pong });
    } catch (err) {
      return indicator.down({ message: err instanceof Error ? err.message : String(err) });
    }
  }
}
