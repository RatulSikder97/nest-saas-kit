import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../options';
import { loadDotEnv } from './load-env';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Ensures the runtime login role from DATABASE_URL exists and is a member of `saas_app`
 * (the NOLOGIN group role that holds the grants and is subject to RLS). The password is synced
 * from DATABASE_URL and the role is always forced to NOSUPERUSER NOBYPASSRLS.
 */
export async function ensureAppRole(migrationUrl: string, appUrl: string): Promise<void> {
  const app = new URL(appUrl);
  const owner = new URL(migrationUrl);
  const roleName = decodeURIComponent(app.username);
  if (!roleName || roleName === decodeURIComponent(owner.username)) {
    throw new Error('DATABASE_URL must use a dedicated role, not the migration/owner role');
  }
  const client = new Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const role = client.escapeIdentifier(roleName);
    const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
      roleName,
    ]);
    if (!rowCount) {
      const password = client.escapeLiteral(decodeURIComponent(app.password));
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD ${password}`);
    }
    await client.query(`ALTER ROLE ${role} NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`);
    await client.query(`GRANT saas_app TO ${role}`);
  } finally {
    await client.end();
  }
}

export async function migrate(options: { revert?: boolean } = {}): Promise<void> {
  const migrationUrl = requireEnv('DATABASE_MIGRATION_URL');
  const dataSource = new DataSource(buildDataSourceOptions(migrationUrl, 2));
  await dataSource.initialize();
  try {
    if (options.revert) {
      await dataSource.undoLastMigration({ transaction: 'each' });
      return;
    }
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    for (const m of applied) console.log(`applied migration ${m.name}`);
    if (applied.length === 0) console.log('database schema is up to date');
  } finally {
    await dataSource.destroy();
  }
  await ensureAppRole(migrationUrl, requireEnv('DATABASE_URL'));
}

if (require.main === module) {
  loadDotEnv();
  migrate({ revert: process.argv.includes('--revert') }).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
