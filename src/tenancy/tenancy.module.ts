import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';
import { TenantSubscriber } from './tenant.subscriber';
import { TenantTransactionInterceptor } from './tenant-transaction.interceptor';

@Global()
@Module({
  providers: [TenancyService, TenantSubscriber, TenantTransactionInterceptor],
  exports: [TenancyService, TenantTransactionInterceptor],
})
export class TenancyModule {}
