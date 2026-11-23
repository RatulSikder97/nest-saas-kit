import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class InitSchema1732406400000 implements MigrationInterface {
  name = 'InitSchema1732406400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        name text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT ck_users_email_lower CHECK (email = lower(email))
      )`);

    await q.query(`
      CREATE TABLE organizations (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        plan text NOT NULL DEFAULT 'free',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_organizations_slug UNIQUE (slug),
        CONSTRAINT ck_organizations_plan CHECK (plan IN ('free', 'pro', 'enterprise'))
      )`);

    await q.query(`
      CREATE TABLE memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_memberships_org_user UNIQUE (organization_id, user_id),
        CONSTRAINT ck_memberships_role CHECK (role IN ('owner', 'admin', 'member'))
      )`);
    await q.query(`CREATE INDEX ix_memberships_user_id ON memberships (user_id)`);

    await q.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY,
        family_id uuid NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        revoked_at timestamptz,
        replaced_by_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX ix_refresh_tokens_family_id ON refresh_tokens (family_id)`);
    await q.query(`CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id)`);

    await q.query(`
      CREATE TABLE invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL,
        token_hash text NOT NULL,
        invited_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_invitations_token_hash UNIQUE (token_hash),
        CONSTRAINT ck_invitations_role CHECK (role IN ('admin', 'member'))
      )`);
    await q.query(`CREATE INDEX ix_invitations_organization_id ON invitations (organization_id)`);
    await q.query(`
      CREATE UNIQUE INDEX uq_invitations_pending_email ON invitations (organization_id, email)
      WHERE accepted_at IS NULL AND revoked_at IS NULL`);

    await q.query(`
      CREATE TABLE api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        prefix text NOT NULL,
        key_hash text NOT NULL,
        role text NOT NULL,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_api_keys_prefix UNIQUE (prefix),
        CONSTRAINT ck_api_keys_role CHECK (role IN ('admin', 'member'))
      )`);
    await q.query(`CREATE INDEX ix_api_keys_organization_id ON api_keys (organization_id)`);

    await q.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX ix_projects_organization_id ON projects (organization_id)`);

    await q.query(`
      CREATE TABLE audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        actor_type text NOT NULL,
        actor_id uuid,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text NOT NULL,
        changes jsonb NOT NULL DEFAULT '{}'::jsonb,
        request_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_audit_logs_actor_type CHECK (actor_type IN ('user', 'api_key', 'system'))
      )`);
    await q.query(
      `CREATE INDEX ix_audit_logs_org_created ON audit_logs (organization_id, created_at DESC)`,
    );

    await q.query(`
      CREATE TABLE usage_records (
        organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        period date NOT NULL,
        metric text NOT NULL,
        quantity bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, period, metric)
      )`);

    await q.query(`
      CREATE TABLE usage_flush_batches (
        batch_id uuid PRIMARY KEY,
        flushed_at timestamptz NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE outbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid,
        type text NOT NULL,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      )`);
    await q.query(
      `CREATE INDEX ix_outbox_events_unpublished ON outbox_events (created_at) WHERE published_at IS NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'outbox_events',
      'usage_flush_batches',
      'usage_records',
      'audit_logs',
      'projects',
      'api_keys',
      'invitations',
      'refresh_tokens',
      'memberships',
      'organizations',
      'users',
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }
}
