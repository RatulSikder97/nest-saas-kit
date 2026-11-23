import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { type AuthTokens } from '../src/modules/auth/token.service';

export const PASSWORD = 'correct-horse-battery-staple';

export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

export interface TestTenant {
  email: string;
  tokens: AuthTokens;
  auth: { Authorization: string };
  organizationId: string;
}

export async function signup(
  app: INestApplication<App>,
  label = 'owner',
  extra: Record<string, unknown> = {},
): Promise<TestTenant> {
  const email = uniqueEmail(label);
  const res = await request(app.getHttpServer())
    .post('/v1/auth/signup')
    .send({ email, password: PASSWORD, name: label, organizationName: `${label} org`, ...extra })
    .expect(201);
  const tokens = res.body as AuthTokens;
  return {
    email,
    tokens,
    auth: { Authorization: `Bearer ${tokens.accessToken}` },
    organizationId: tokens.organizationId,
  };
}

export async function waitFor<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
}
