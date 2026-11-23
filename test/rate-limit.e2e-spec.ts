import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp, signup } from './helpers';

describe('Per-plan rate limiting (Redis-backed)', () => {
  let app: INestApplication<App>;
  const FREE_LIMIT = Number(process.env.RATE_LIMIT_FREE);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('throttles an organization at its plan limit without affecting other organizations', async () => {
    const noisy = await signup(app, 'noisy');
    const quiet = await signup(app, 'quiet');
    const server = app.getHttpServer();

    for (let i = 0; i < FREE_LIMIT; i++) {
      await request(server).get('/v1/projects').set(noisy.auth).expect(200);
    }
    const limited = await request(server).get('/v1/projects').set(noisy.auth).expect(429);
    expect(limited.headers['retry-after']).toBeDefined();

    // The bucket is per organization, so a different tenant is unaffected.
    await request(server).get('/v1/projects').set(quiet.auth).expect(200);
  });

  it('applies the limit across all credentials of the same organization', async () => {
    const owner = await signup(app, 'shared');
    const server = app.getHttpServer();
    const key = (
      await request(server).post('/v1/api-keys').set(owner.auth).send({ name: 'k' }).expect(201)
    ).body.secret as string;
    for (let i = 0; i < FREE_LIMIT - 1; i++) {
      await request(server).get('/v1/projects').set('X-API-Key', key).expect(200);
    }
    // The API-key creation request above consumed the last unit of this organization's budget.
    await request(server).get('/v1/projects').set(owner.auth).expect(429);
  });
});
