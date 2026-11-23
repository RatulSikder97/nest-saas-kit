import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';

/**
 * One row per issued refresh token. Tokens are opaque `<id>.<secret>` strings; only a SHA-256
 * of the secret is stored. All tokens descending from one login share a `familyId`; presenting
 * an already-rotated token revokes the entire family (reuse detection).
 */
@Entity({ name: 'refresh_tokens' })
@Index('ix_refresh_tokens_family_id', ['familyId'])
@Index('ix_refresh_tokens_user_id', ['userId'])
@ForeignKey(() => User, ['userId'], ['id'], {
  name: 'refresh_tokens_user_id_fkey',
  onDelete: 'CASCADE',
})
@ForeignKey(() => Organization, ['organizationId'], ['id'], {
  name: 'refresh_tokens_organization_id_fkey',
  onDelete: 'CASCADE',
})
export class RefreshToken {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
