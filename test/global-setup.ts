import Redis from 'ioredis';
import { Client } from 'pg';
import { migrate } from '../src/database/cli/migrate';
import './setup-env';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for e2e tests`);
  return value;
}

/** Recreates the e2e database from migrations and clears the e2e Redis DB. */
export default async function globalSetup(): Promise<void> {
  const dbName = new URL(requireEnv('DATABASE_MIGRATION_URL')).pathname.slice(1);
  const admin = new Client({ connectionString: requireEnv('DATABASE_ADMIN_URL') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${admin.escapeIdentifier(dbName)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${admin.escapeIdentifier(dbName)}`);
  } finally {
    await admin.end();
  }
  await migrate();

  const redis = new Redis(requireEnv('REDIS_URL'));
  try {
    await redis.flushdb();
  } finally {
    await redis.quit();
  }
}
