import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { type AuthenticatedRequest } from '../common/types/principal';
import { TenancyService } from './tenancy.service';

/**
 * Wraps every authenticated request in a tenant transaction so handlers and services can use
 * TenancyService.manager() / TenantRepository without threading the organization around.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly tenancy: TenancyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = req.principal;
    if (!principal) return next.handle();
    return from(
      this.tenancy.run(
        {
          organizationId: principal.organizationId,
          userId: principal.type === 'user' ? principal.userId : null,
          requestId: typeof req.id === 'string' ? req.id : null,
        },
        () => lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    );
  }
}
