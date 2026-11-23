import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { type JsonDiff } from '../../common/utils/json-diff';
import { TenantScopedEntity } from '../../tenancy/tenant-scoped.entity';

export type AuditActorType = 'user' | 'api_key' | 'system';

@Entity({ name: 'audit_logs' })
@Index('ix_audit_logs_org_created', ['organizationId', 'createdAt'])
@Check('ck_audit_logs_actor_type', `actor_type IN ('user', 'api_key', 'system')`)
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'audit_logs_organization_id_fkey',
  onDelete: 'CASCADE',
})
export class AuditLog extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_type', type: 'text' })
  actorType!: AuditActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'text' })
  entityId!: string;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  changes!: JsonDiff;

  @Column({ name: 'request_id', type: 'text', nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
