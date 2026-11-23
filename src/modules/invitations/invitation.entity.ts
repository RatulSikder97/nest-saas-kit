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

@Entity({ name: 'invitations' })
@Unique('uq_invitations_token_hash', ['tokenHash'])
@Index('ix_invitations_organization_id', ['organizationId'])
@Index('uq_invitations_pending_email', ['organizationId', 'email'], {
  unique: true,
  where: '((accepted_at IS NULL) AND (revoked_at IS NULL))',
})
@Check('ck_invitations_role', `role IN ('admin', 'member')`)
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'invitations_organization_id_fkey',
  onDelete: 'CASCADE',
})
@ForeignKey(() => User, ['invitedByUserId'], ['id'], {
  name: 'invitations_invited_by_user_id_fkey',
  onDelete: 'CASCADE',
})
export class Invitation extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  role!: Exclude<Role, 'owner'>;

  @Column({ name: 'token_hash', type: 'text', select: false })
  tokenHash!: string;

  @Column({ name: 'invited_by_user_id', type: 'uuid' })
  invitedByUserId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
