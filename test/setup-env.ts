/**
 * E2E environment. Targets the docker-compose Postgres/Redis (or CI service containers) and a
 * dedicated `saas_test` database + Redis DB 1, so running the suite never touches dev data.
 * Override POSTGRES_PORT / REDIS_PORT (or the full URLs) if the defaults are taken locally.
 */
const pgHost = process.env.POSTGRES_HOST ?? 'localhost';
const pgPort = process.env.POSTGRES_PORT ?? '5432';
const redisHost = process.env.REDIS_HOST ?? 'localhost';
const redisPort = process.env.REDIS_PORT ?? '6379';

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: `postgres://saas_app_test:test-app-password@${pgHost}:${pgPort}/saas_test`,
  DATABASE_MIGRATION_URL: `postgres://saas:saas@${pgHost}:${pgPort}/saas_test`,
  DATABASE_ADMIN_URL: `postgres://saas:saas@${pgHost}:${pgPort}/postgres`,
  REDIS_URL: `redis://${redisHost}:${redisPort}/1`,
  JWT_ACCESS_SECRET: 'e2e-jwt-secret-0123456789abcdefghijklmnop',
  API_KEY_PEPPER: 'e2e-api-key-pepper-0123456789abcdefghijkl',
  PUBLIC_APP_URL: 'http://app.test',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  RATE_LIMIT_ANONYMOUS: '10000',
  RATE_LIMIT_FREE: '40',
  RATE_LIMIT_PRO: '400',
  RATE_LIMIT_ENTERPRISE: '4000',
  OUTBOX_POLL_INTERVAL_MS: '200',
  USAGE_FLUSH_INTERVAL_MS: '600000',
  SWAGGER_ENABLED: 'false',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
// Always force test mode, even if the caller's shell exported NODE_ENV.
process.env.NODE_ENV = 'test';
