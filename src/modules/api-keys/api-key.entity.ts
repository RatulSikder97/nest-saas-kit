import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';
import { type Role } from '../../common/types/roles';
import { TenantScopedEntity } from '../../tenancy/tenant-scoped.entity';

/**
 * Keys look like `nsk_<prefix>_<secret>`. The prefix is stored in clear (unique, indexed) so a key
 * can be identified in logs and looked up in O(1); the full key is stored as HMAC-SHA256 with a
 * server-side pepper, so a database leak alone cannot be used to authenticate.
 */
@Entity({ name: 'api_keys' })
@Unique('uq_api_keys_prefix', ['prefix'])
@Index('ix_api_keys_organization_id', ['organizationId'])
@Check('ck_api_keys_role', `role IN ('admin', 'member')`)
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'api_keys_organization_id_fkey',
  onDelete: 'CASCADE',
})
@ForeignKey(() => User, ['createdByUserId'], ['id'], {
  name: 'api_keys_created_by_user_id_fkey',
  onDelete: 'CASCADE',
})
export class ApiKey extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  prefix!: string;

  @Column({ name: 'key_hash', type: 'text', select: false })
  keyHash!: string;

  @Column({ type: 'text' })
  role!: Exclude<Role, 'owner'>;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
