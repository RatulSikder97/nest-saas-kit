import { type MigrationInterface, type QueryRunner } from 'typeorm';

/** Tables whose rows belong to exactly one organization via organization_id. */
const ORG_OWNED = ['invitations', 'api_keys', 'projects', 'audit_logs', 'usage_records'] as const;
const ALL_TABLES = [
  'users',
  'organizations',
  'memberships',
  'refresh_tokens',
  'usage_flush_batches',
  'outbox_events',
  ...ORG_OWNED,
] as const;

/**
 * Defence in depth: Postgres Row-Level Security mirrors the application-layer tenant filter.
 *
 * - The runtime role `saas_app` is NOT the table owner, so policies apply to it (owners and
 *   superusers bypass non-forced RLS; that is what migrations and the SECURITY DEFINER lookups
 *   below rely on).
 * - The tenant is read from transaction-local settings written by TenancyService.run().
 *   With no context set, every policy evaluates to false: queries fail closed.
 */
export class RowLevelSecurity1732406500000 implements MigrationInterface {
  name = 'RowLevelSecurity1732406500000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saas_app') THEN
          CREATE ROLE saas_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
      END
      $$`);

    await q.query(`
      CREATE FUNCTION app_current_org_id() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid $$`);
    await q.query(`
      CREATE FUNCTION app_current_user_id() RETURNS uuid
      LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$`);

    await q.query(`GRANT USAGE ON SCHEMA public TO saas_app`);
    await q.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${ALL_TABLES.join(', ')} TO saas_app`);
    await q.query(
      `GRANT EXECUTE ON FUNCTION app_current_org_id(), app_current_user_id() TO saas_app`,
    );

    for (const table of ORG_OWNED) {
      await q.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await q.query(`
        CREATE POLICY tenant_isolation ON ${table}
        USING (organization_id = app_current_org_id())
        WITH CHECK (organization_id = app_current_org_id())`);
    }

    // A user may see their own memberships across organizations (to pick one at login),
    // but may only create/modify memberships inside the current organization.
    await q.query(`ALTER TABLE memberships ENABLE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON memberships
      USING (organization_id = app_current_org_id() OR user_id = app_current_user_id())
      WITH CHECK (organization_id = app_current_org_id())`);

    await q.query(`ALTER TABLE organizations ENABLE ROW LEVEL SECURITY`);
    await q.query(`
      CREATE POLICY tenant_isolation ON organizations
      USING (
        id = app_current_org_id()
        OR EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.organization_id = organizations.id AND m.user_id = app_current_user_id()
        )
      )
      WITH CHECK (id = app_current_org_id())`);

    // Pre-authentication lookups. They run before a tenant is known, so they are exposed as
    // narrow SECURITY DEFINER functions instead of relaxing the table policies.
    await q.query(`
      CREATE FUNCTION app_resolve_api_key(p_prefix text)
      RETURNS TABLE (
        id uuid, organization_id uuid, key_hash text, role text,
        expires_at timestamptz, revoked_at timestamptz, plan text
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS $$
        SELECT k.id, k.organization_id, k.key_hash, k.role, k.expires_at, k.revoked_at, o.plan
        FROM api_keys k JOIN organizations o ON o.id = k.organization_id
        WHERE k.prefix = p_prefix
      $$`);
    await q.query(`
      CREATE FUNCTION app_find_invitation(p_token_hash text)
      RETURNS TABLE (
        id uuid, organization_id uuid, email text, role text,
        expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz
      )
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
      AS $$
        SELECT i.id, i.organization_id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at
        FROM invitations i
        WHERE i.token_hash = p_token_hash
      $$`);
    for (const fn of ['app_resolve_api_key(text)', 'app_find_invitation(text)']) {
      await q.query(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
      await q.query(`GRANT EXECUTE ON FUNCTION ${fn} TO saas_app`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP FUNCTION IF EXISTS app_find_invitation(text)`);
    await q.query(`DROP FUNCTION IF EXISTS app_resolve_api_key(text)`);
    for (const table of ['organizations', 'memberships', ...ORG_OWNED]) {
      await q.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table}`);
      await q.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
    await q.query(
      `REVOKE SELECT, INSERT, UPDATE, DELETE ON ${ALL_TABLES.join(', ')} FROM saas_app`,
    );
    await q.query(
      `REVOKE EXECUTE ON FUNCTION app_current_org_id(), app_current_user_id() FROM saas_app`,
    );
    await q.query(`REVOKE USAGE ON SCHEMA public FROM saas_app`);
    await q.query(`DROP FUNCTION IF EXISTS app_current_user_id()`);
    await q.query(`DROP FUNCTION IF EXISTS app_current_org_id()`);
  }
}
