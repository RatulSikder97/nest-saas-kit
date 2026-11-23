import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { from, type Observable, switchMap } from 'rxjs';
import { type AuthenticatedRequest } from '../../common/types/principal';
import { METRIC_API_REQUESTS, UsageService } from './usage.service';

/** Counts every authenticated API request against the caller's organization. */
@Injectable()
export class UsageMeteringInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageMeteringInterceptor.name);

  constructor(private readonly usage: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (context.getType() !== 'http' || !principal) return next.handle();
    return from(this.meter(principal.organizationId)).pipe(switchMap(() => next.handle()));
  }

  /** Metering is best-effort: a Redis blip is logged and must not fail the customer's request. */
  private async meter(organizationId: string): Promise<void> {
    try {
      await this.usage.increment(organizationId, METRIC_API_REQUESTS);
    } catch (err) {
      this.logger.error(
        `usage metering failed for org ${organizationId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
