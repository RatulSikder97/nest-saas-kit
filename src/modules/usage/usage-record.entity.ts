import { Column, Entity, ForeignKey, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../organizations/organization.entity';

const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string | null): number => (value === null ? 0 : Number(value)),
};

/** Daily usage counters per organization and metric (flushed from Redis by the worker). */
@Entity({ name: 'usage_records' })
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'usage_records_organization_id_fkey',
  onDelete: 'CASCADE',
})
export class UsageRecord {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @PrimaryColumn({ type: 'date' })
  period!: string;

  @PrimaryColumn({ type: 'text' })
  metric!: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintToNumber })
  quantity!: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
