import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { AppConfig } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { LoggingModule } from '../logging/logging.module';
import { MailerModule } from '../modules/mailer/mailer.module';
import { DomainEventsProcessor } from '../modules/outbox/domain-events.processor';
import { OutboxRelayService } from '../modules/outbox/outbox-relay.service';
import { DOMAIN_EVENTS_QUEUE, SYSTEM_QUEUE } from '../modules/outbox/outbox.service';
import { UsageService } from '../modules/usage/usage.service';
import { redisOptionsFromUrl } from '../redis/redis-connection';
import { RedisModule } from '../redis/redis.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SystemProcessor } from './system.processor';

/** Background worker: outbox relay, domain-event handlers, usage flush. No HTTP server. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    TenancyModule,
    MailerModule,
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: { ...redisOptionsFromUrl(config.get('REDIS_URL')), maxRetriesPerRequest: null },
        prefix: 'bull',
      }),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }, { name: DOMAIN_EVENTS_QUEUE }),
  ],
  providers: [OutboxRelayService, DomainEventsProcessor, SystemProcessor, UsageService],
})
export class WorkerModule {}
