import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type EntityTarget } from 'typeorm';
import { type TenantScope, TenantContextMissingError, tenantStorage } from './tenant-context';
import { TenantRepository } from './tenant-repository';
import { type TenantScopedEntity } from './tenant-scoped.entity';

@Injectable()
export class TenancyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Runs `fn` inside a database transaction whose Postgres session variables
   * (`app.current_org_id`, `app.current_user_id`) drive the RLS policies. `set_config(..., true)`
   * is transaction-local, so pooled connections never leak a tenant to the next borrower.
   *
   * Nested calls for the same scope join the outer transaction.
   */
  async run<T>(
    scope: Partial<TenantScope>,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const organizationId = scope.organizationId ?? null;
    const userId = scope.userId ?? null;
    const current = tenantStorage.getStore();
    if (current && current.organizationId === organizationId && current.userId === userId) {
      return fn(current.manager);
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT set_config('app.current_org_id', $1, true), set_config('app.current_user_id', $2, true)`,
        [organizationId ?? '', userId ?? ''],
      );
      return tenantStorage.run(
        { organizationId, userId, requestId: scope.requestId ?? null, manager },
        () => fn(manager),
      );
    });
  }

  /**
   * Runs a user-scoped read. Inside a request transaction for the same user the current manager
   * is reused: the membership/organization policies already expose the user's own memberships,
   * so no second pooled connection is needed.
   */
  async withUser<T>(userId: string, fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    const current = tenantStorage.getStore();
    if (current && current.userId === userId) return fn(current.manager);
    return this.run({ userId }, fn);
  }

  /** EntityManager bound to the active tenant transaction. */
  manager(): EntityManager {
    const store = tenantStorage.getStore();
    if (!store) throw new TenantContextMissingError('TenancyService.manager()');
    return store.manager;
  }

  organizationId(): string {
    const orgId = tenantStorage.getStore()?.organizationId;
    if (!orgId) throw new TenantContextMissingError('TenancyService.organizationId()');
    return orgId;
  }

  requestId(): string | null {
    return tenantStorage.getStore()?.requestId ?? null;
  }

  repository<T extends TenantScopedEntity>(target: EntityTarget<T>): TenantRepository<T> {
    return new TenantRepository(target, this);
  }
}
