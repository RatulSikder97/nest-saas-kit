import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  type EntitySubscriberInterface,
  type InsertEvent,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm';
import { TenantViolationError, tenantStorage } from './tenant-context';
import { TenantScopedEntity } from './tenant-scoped.entity';

/**
 * Guards every ORM write to a tenant-scoped entity:
 *  - inserts are stamped with the active organization (or rejected if they name another one),
 *  - updates / removes of rows owned by another organization are rejected.
 * Writes outside a tenant context are left to Postgres RLS, which rejects them.
 */
@Injectable()
export class TenantSubscriber implements EntitySubscriberInterface<TenantScopedEntity> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo(): typeof TenantScopedEntity {
    return TenantScopedEntity;
  }

  beforeInsert(event: InsertEvent<TenantScopedEntity>): void {
    const orgId = tenantStorage.getStore()?.organizationId;
    if (!orgId) return;
    if (!event.entity.organizationId) {
      event.entity.organizationId = orgId;
    } else if (event.entity.organizationId !== orgId) {
      throw new TenantViolationError(
        `Cannot insert ${event.metadata.name} for another organization`,
      );
    }
  }

  beforeUpdate(event: UpdateEvent<TenantScopedEntity>): void {
    this.assertSameTenant(event.metadata.name, event.databaseEntity?.organizationId);
    this.assertSameTenant(event.metadata.name, event.entity?.organizationId);
  }

  beforeRemove(event: RemoveEvent<TenantScopedEntity>): void {
    this.assertSameTenant(event.metadata.name, event.databaseEntity?.organizationId);
    this.assertSameTenant(event.metadata.name, event.entity?.organizationId);
  }

  private assertSameTenant(entityName: string, rowOrgId: unknown): void {
    const orgId = tenantStorage.getStore()?.organizationId;
    if (orgId && typeof rowOrgId === 'string' && rowOrgId !== orgId) {
      throw new TenantViolationError(`Cannot modify ${entityName} of another organization`);
    }
  }
}
