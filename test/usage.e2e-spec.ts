import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { UsageService } from '../src/modules/usage/usage.service';
import { createTestApp, signup } from './helpers';

describe('Usage metering (Redis -> Postgres flush)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('counts authenticated requests per organization and flushes them exactly once', async () => {
    const owner = await signup(app, 'metered');
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i++) {
      await request(server).get('/v1/projects').set(owner.auth).expect(200);
    }

    const before = await request(server).get('/v1/usage').set(owner.auth).expect(200);
    // 5 project reads + this usage read
    expect(before.body.pending.api_requests).toBe(6);

    const usage = app.get(UsageService);
    await usage.flush();
    await usage.flush(); // second flush must not double count

    const after = await request(server).get('/v1/usage').set(owner.auth).expect(200);
    expect(after.body.records).toEqual([
      expect.objectContaining({ metric: 'api_requests', quantity: 6 }),
    ]);
    expect(after.body.pending.api_requests).toBe(1);
  });
});
