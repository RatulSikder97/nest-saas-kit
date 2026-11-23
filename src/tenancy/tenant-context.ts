import { AsyncLocalStorage } from 'node:async_hooks';
import { type EntityManager } from 'typeorm';

export interface TenantScope {
  organizationId: string | null;
  userId: string | null;
  /** Correlates audit rows with request logs. */
  requestId?: string | null;
}

export interface TenantStore extends TenantScope {
  manager: EntityManager;
}

/**
 * Process-wide async context for the active tenant transaction. Kept outside DI so that
 * TypeORM subscribers (constructed by TypeORM, not Nest) can read it.
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export class TenantContextMissingError extends Error {
  constructor(what: string) {
    super(`${what} requires an active tenant context (TenancyService.run)`);
    this.name = 'TenantContextMissingError';
  }
}

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}
