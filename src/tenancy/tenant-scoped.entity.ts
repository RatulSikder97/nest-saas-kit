import { Column } from 'typeorm';

/**
 * Base class for every row owned by an organization. Rows extending it are:
 *  - auto-stamped / verified by TenantSubscriber,
 *  - auto-filtered by TenantRepository,
 *  - protected by a Postgres RLS policy on organization_id (see migrations).
 */
export abstract class TenantScopedEntity {
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;
}
