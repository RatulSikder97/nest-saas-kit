import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type OutboxPayload = Record<string, unknown>;

/**
 * Transactional outbox. Events are inserted in the same transaction as the state change that
 * produced them and relayed to BullMQ by the worker, giving at-least-once delivery without 2PC.
 * Infrastructure table: intentionally not under RLS so a single relay can drain all tenants.
 */
@Entity({ name: 'outbox_events' })
@Index('ix_outbox_events_unpublished', ['createdAt'], { where: '(published_at IS NULL)' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: OutboxPayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
