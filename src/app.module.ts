import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { AuthenticationGuard } from './common/guards/authentication.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggingModule } from './logging/logging.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { IdempotencyInterceptor } from './modules/idempotency/idempotency.interceptor';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { UsageMeteringInterceptor } from './modules/usage/usage-metering.interceptor';
import { UsageModule } from './modules/usage/usage.module';
import { UsersModule } from './modules/users/users.module';
import { RedisModule } from './redis/redis.module';
import { TenantTransactionInterceptor } from './tenancy/tenant-transaction.interceptor';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    TenancyModule,
    RateLimitModule,
    AuditModule,
    OutboxModule,
    IdempotencyModule,
    UsersModule,
    OrganizationsModule,
    AuthModule,
    InvitationsModule,
    ApiKeysModule,
    ProjectsModule,
    UsageModule,
    HealthModule,
  ],
  providers: [
    // Guards run in this order: authenticate -> authorize -> rate limit (needs the plan).
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Interceptors wrap outside-in: metering -> idempotency -> tenant transaction -> handler.
    // Idempotent replays therefore skip the DB entirely, and responses are cached only after commit.
    { provide: APP_INTERCEPTOR, useExisting: UsageMeteringInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: TenantTransactionInterceptor },
    { provide: APP_FILTER, useClass: DatabaseExceptionFilter },
  ],
})
export class AppModule {}
