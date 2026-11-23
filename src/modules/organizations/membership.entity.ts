import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { type Role } from '../../common/types/roles';
import { TenantScopedEntity } from '../../tenancy/tenant-scoped.entity';
import { User } from '../users/user.entity';
import { Organization } from './organization.entity';

@Entity({ name: 'memberships' })
@Unique('uq_memberships_org_user', ['organizationId', 'userId'])
@Index('ix_memberships_user_id', ['userId'])
@Check('ck_memberships_role', `role IN ('owner', 'admin', 'member')`)
export class Membership extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'text' })
  role!: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'memberships_user_id_fkey' })
  user?: User;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'organization_id',
    foreignKeyConstraintName: 'memberships_organization_id_fkey',
  })
  organization?: Organization;
}
