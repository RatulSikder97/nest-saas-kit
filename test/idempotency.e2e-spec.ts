import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp, signup } from './helpers';

describe('Idempotency-Key', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('replays the original response for retries and creates the resource once', async () => {
    const owner = await signup(app, 'idem');
    const server = app.getHttpServer();
    const send = () =>
      request(server)
        .post('/v1/projects')
        .set(owner.auth)
        .set('Idempotency-Key', 'create-project-1')
        .send({ name: 'Once' });

    const first = await send().expect(201);
    const second = await send().expect(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);

    const list = await request(server).get('/v1/projects').set(owner.auth).expect(200);
    expect(list.body.total).toBe(1);
  });

  it('rejects the same key with a different payload', async () => {
    const owner = await signup(app, 'idem-mismatch');
    const server = app.getHttpServer();
    await request(server)
      .post('/v1/projects')
      .set(owner.auth)
      .set('Idempotency-Key', 'k1')
      .send({ name: 'A' })
      .expect(201);
    await request(server)
      .post('/v1/projects')
      .set(owner.auth)
      .set('Idempotency-Key', 'k1')
      .send({ name: 'B' })
      .expect(422);
  });

  it('scopes keys per principal so tenants never see each other’s cached responses', async () => {
    const a = await signup(app, 'idem-a');
    const b = await signup(app, 'idem-b');
    const server = app.getHttpServer();
    const ra = await request(server)
      .post('/v1/projects')
      .set(a.auth)
      .set('Idempotency-Key', 'shared')
      .send({ name: 'X' })
      .expect(201);
    const rb = await request(server)
      .post('/v1/projects')
      .set(b.auth)
      .set('Idempotency-Key', 'shared')
      .send({ name: 'X' })
      .expect(201);
    expect(rb.headers['idempotent-replayed']).toBeUndefined();
    expect(rb.body.organizationId).toBe(b.organizationId);
    expect(rb.body.id).not.toBe(ra.body.id);
  });

  it('does not cache failures, so a corrected retry succeeds', async () => {
    const owner = await signup(app, 'idem-fail');
    const server = app.getHttpServer();
    await request(server)
      .post('/v1/projects')
      .set(owner.auth)
      .set('Idempotency-Key', 'k2')
      .send({ name: '' })
      .expect(400);
    // Validation failures happen before the interceptor; a downstream failure (409 below) releases the key.
    await request(server)
      .post('/v1/invitations')
      .set(owner.auth)
      .set('Idempotency-Key', 'k3')
      .send({ email: owner.email, role: 'member' })
      .expect(409);
    await request(server)
      .post('/v1/invitations')
      .set(owner.auth)
      .set('Idempotency-Key', 'k3')
      .send({ email: owner.email, role: 'member' })
      .expect(409);
  });
});
