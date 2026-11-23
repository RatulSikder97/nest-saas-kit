import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config.service';
import { REDIS } from './redis.constants';

/** Shared ioredis client for app-level concerns (idempotency, metering, rate limiting). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis => {
        const client = new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: 3 });
        const logger = new Logger('Redis');
        client.on('error', (err) => logger.error(`redis error: ${err.message}`));
        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }
}
