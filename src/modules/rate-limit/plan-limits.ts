import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerModuleOptions, type ThrottlerStorage } from '@nestjs/throttler';
import { type AppConfig } from '../../config/app-config.service';
import { type AuthenticatedRequest } from '../../common/types/principal';
import { type Plan } from '../../common/types/roles';

export function planLimits(config: AppConfig): Record<Plan | 'anonymous', number> {
  return {
    anonymous: config.get('RATE_LIMIT_ANONYMOUS'),
    free: config.get('RATE_LIMIT_FREE'),
    pro: config.get('RATE_LIMIT_PRO'),
    enterprise: config.get('RATE_LIMIT_ENTERPRISE'),
  };
}

/** Authenticated traffic is bucketed per organization; anonymous traffic per client IP. */
export function trackerFor(req: AuthenticatedRequest): string {
  return req.principal ? `org:${req.principal.organizationId}` : `ip:${req.ip ?? 'unknown'}`;
}

export function limitFor(
  limits: Record<Plan | 'anonymous', number>,
  context: ExecutionContext,
): number {
  const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  return limits[principal?.plan ?? 'anonymous'];
}

/**
 * One fixed-window throttler whose limit depends on the caller's plan. Counters live in Redis so
 * limits hold across API replicas.
 */
export function buildThrottlerOptions(
  config: AppConfig,
  storage: ThrottlerStorage,
): ThrottlerModuleOptions {
  const limits = planLimits(config);
  return {
    storage,
    // The throttler types the request as Record<string, any>; it is the Express request.
    getTracker: (req) => trackerFor(req as AuthenticatedRequest),
    // One budget per tenant across all routes (the default key is per route).
    generateKey: (_context, tracker, throttlerName) => `throttle:${throttlerName}:${tracker}`,
    throttlers: [
      {
        name: 'default',
        ttl: config.get('RATE_LIMIT_WINDOW_SECONDS') * 1000,
        limit: (context) => limitFor(limits, context),
      },
    ],
  };
}
