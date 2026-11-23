import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { AppConfig } from '../../config/app-config.service';
import { REDIS } from '../../redis/redis.constants';
import { buildThrottlerOptions } from './plan-limits';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfig, REDIS],
      useFactory: (config: AppConfig, redis: Redis) =>
        buildThrottlerOptions(config, new ThrottlerStorageRedisService(redis)),
    }),
  ],
})
export class RateLimitModule {}
