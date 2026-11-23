import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Global identity. Not tenant-scoped: one user can belong to many organizations. */
@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
@Check('ck_users_email_lower', 'email = lower(email)')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
