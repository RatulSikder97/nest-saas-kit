import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool,
  SWAGGER_ENABLED: bool,
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: positiveInt(10),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('nest-saas-kit'),
  ACCESS_TOKEN_TTL_SECONDS: positiveInt(900),
  REFRESH_TOKEN_TTL_DAYS: positiveInt(30),
  API_KEY_PEPPER: z.string().min(32, 'API_KEY_PEPPER must be at least 32 characters'),
  INVITATION_TTL_HOURS: positiveInt(72),

  RATE_LIMIT_WINDOW_SECONDS: positiveInt(60),
  RATE_LIMIT_ANONYMOUS: positiveInt(60),
  RATE_LIMIT_FREE: positiveInt(120),
  RATE_LIMIT_PRO: positiveInt(1200),
  RATE_LIMIT_ENTERPRISE: positiveInt(6000),

  IDEMPOTENCY_TTL_SECONDS: positiveInt(86_400),
  IDEMPOTENCY_LOCK_TTL_SECONDS: positiveInt(60),

  OUTBOX_POLL_INTERVAL_MS: positiveInt(1000),
  USAGE_FLUSH_INTERVAL_MS: positiveInt(60_000),

  MAILER_DRIVER: z.enum(['console']).default('console'),
  MAIL_FROM: z.string().default('no-reply@example.com'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
