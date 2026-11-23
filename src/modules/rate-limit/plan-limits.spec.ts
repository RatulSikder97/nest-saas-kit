import { type ExecutionContext } from '@nestjs/common';
import { type AppConfig } from '../../config/app-config.service';
import { type AuthenticatedRequest } from '../../common/types/principal';
import { limitFor, planLimits, trackerFor } from './plan-limits';

const config = {
  get: (key: string) =>
    ({
      RATE_LIMIT_ANONYMOUS: 10,
      RATE_LIMIT_FREE: 100,
      RATE_LIMIT_PRO: 1000,
      RATE_LIMIT_ENTERPRISE: 5000,
    })[key],
} as unknown as AppConfig;

const ctx = (req: Partial<AuthenticatedRequest>) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

describe('plan-based rate limits', () => {
  const limits = planLimits(config);
  const principal = (plan: 'free' | 'pro' | 'enterprise') =>
    ({ type: 'api_key', apiKeyId: 'k', organizationId: 'org-1', role: 'member', plan }) as const;

  it('selects the limit from the caller plan', () => {
    expect(limitFor(limits, ctx({}))).toBe(10);
    expect(limitFor(limits, ctx({ principal: principal('free') }))).toBe(100);
    expect(limitFor(limits, ctx({ principal: principal('pro') }))).toBe(1000);
    expect(limitFor(limits, ctx({ principal: principal('enterprise') }))).toBe(5000);
  });

  it('buckets by organization when authenticated and by IP otherwise', () => {
    expect(trackerFor({ principal: principal('pro') } as AuthenticatedRequest)).toBe('org:org-1');
    expect(trackerFor({ ip: '10.0.0.1' } as AuthenticatedRequest)).toBe('ip:10.0.0.1');
  });
});
