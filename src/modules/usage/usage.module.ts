import { Module } from '@nestjs/common';
import { UsageMeteringInterceptor } from './usage-metering.interceptor';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  controllers: [UsageController],
  providers: [UsageService, UsageMeteringInterceptor],
  exports: [UsageService, UsageMeteringInterceptor],
})
export class UsageModule {}
