import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { TenantScopedEntity } from '../../tenancy/tenant-scoped.entity';

/** Example tenant-owned resource used to demonstrate the isolation guarantees. */
@Entity({ name: 'projects' })
@Index('ix_projects_organization_id', ['organizationId'])
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'projects_organization_id_fkey',
  onDelete: 'CASCADE',
})
export class Project extends TenantScopedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
