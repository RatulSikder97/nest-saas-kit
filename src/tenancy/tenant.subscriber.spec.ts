import { type DataSource, type InsertEvent, type UpdateEvent } from 'typeorm';
import { type TenantStore, TenantViolationError, tenantStorage } from './tenant-context';
import { type TenantScopedEntity } from './tenant-scoped.entity';
import { TenantSubscriber } from './tenant.subscriber';

describe('TenantSubscriber', () => {
  const ORG = 'org-a';
  const subscriber = new TenantSubscriber({ subscribers: [] } as unknown as DataSource);
  const store = { organizationId: ORG, userId: null, manager: {} } as TenantStore;
  const metadata = { name: 'Widget' };

  const insert = (entity: Partial<TenantScopedEntity>) =>
    ({ entity, metadata }) as unknown as InsertEvent<TenantScopedEntity>;

  it('stamps inserts with the active organization', () => {
    const event = insert({});
    tenantStorage.run(store, () => subscriber.beforeInsert(event));
    expect(event.entity.organizationId).toBe(ORG);
  });

  it('rejects inserts for another organization', () => {
    expect(() =>
      tenantStorage.run(store, () => subscriber.beforeInsert(insert({ organizationId: 'org-b' }))),
    ).toThrow(TenantViolationError);
  });

  it('rejects updates of rows owned by another organization', () => {
    const event = {
      entity: { organizationId: ORG },
      databaseEntity: { organizationId: 'org-b' },
      metadata,
    } as unknown as UpdateEvent<TenantScopedEntity>;
    expect(() => tenantStorage.run(store, () => subscriber.beforeUpdate(event))).toThrow(
      TenantViolationError,
    );
  });

  it('defers to RLS when there is no tenant context', () => {
    const event = insert({ organizationId: 'org-b' });
    expect(() => subscriber.beforeInsert(event)).not.toThrow();
  });
});
