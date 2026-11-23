import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { type AuthTokens } from '../src/modules/auth/token.service';
import { createTestApp, PASSWORD, signup } from './helpers';

describe('Authentication', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const refresh = (token: string) =>
    request(app.getHttpServer()).post('/v1/auth/refresh').send({ refreshToken: token });

  it('signs up, logs in and returns the current user', async () => {
    const owner = await signup(app, 'login');
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: owner.email.toUpperCase(), password: PASSWORD })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${(login.body as AuthTokens).accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email: owner.email, role: 'owner', plan: 'free' });
  });

  it('rejects bad credentials, duplicate emails and weak passwords', async () => {
    const owner = await signup(app, 'dupe');
    const server = app.getHttpServer();
    await request(server)
      .post('/v1/auth/login')
      .send({ email: owner.email, password: 'wrong-password!' })
      .expect(401);
    await request(server)
      .post('/v1/auth/signup')
      .send({ email: owner.email, password: PASSWORD, name: 'x', organizationName: 'x org' })
      .expect(409);
    await request(server)
      .post('/v1/auth/signup')
      .send({
        email: 'short@example.test',
        password: 'short',
        name: 'x',
        organizationName: 'x org',
      })
      .expect(400);
    await request(server).get('/v1/projects').expect(401);
    await request(server).get('/v1/projects').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  describe('refresh token rotation', () => {
    it('rotates tokens and detects reuse by revoking the whole family', async () => {
      const { tokens } = await signup(app, 'rotate');

      const first = await refresh(tokens.refreshToken).expect(200);
      const rotated = first.body as AuthTokens;
      expect(rotated.refreshToken).not.toEqual(tokens.refreshToken);

      // Replaying the already-rotated token is treated as theft...
      const reuse = await refresh(tokens.refreshToken).expect(401);
      expect(reuse.body.message).toMatch(/reuse detected/);

      // ...and the legitimate successor is revoked with the rest of the family.
      await refresh(rotated.refreshToken).expect(401);
    });

    it('allows only one winner when the same token is refreshed concurrently', async () => {
      const { tokens } = await signup(app, 'race');
      const results = await Promise.all([
        refresh(tokens.refreshToken),
        refresh(tokens.refreshToken),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 401]);
      const winner = results.find((r) => r.status === 200)?.body as AuthTokens;
      await refresh(winner.refreshToken).expect(401);
    });

    it('logout revokes the session', async () => {
      const { tokens } = await signup(app, 'logout');
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: tokens.refreshToken })
        .expect(204);
      await refresh(tokens.refreshToken).expect(401);
    });

    it('rejects malformed refresh tokens', async () => {
      await refresh('nope').expect(401);
      await refresh(`00000000-0000-0000-0000-000000000000.${'a'.repeat(43)}`).expect(401);
    });
  });

  describe('RBAC', () => {
    it('restricts admin-only endpoints and keeps API keys away from human-only endpoints', async () => {
      const server = app.getHttpServer();
      const owner = await signup(app, 'rbac');
      const memberKey = (
        await request(server)
          .post('/v1/api-keys')
          .set(owner.auth)
          .send({ name: 'm', role: 'member' })
          .expect(201)
      ).body.secret as string;
      const adminKey = (
        await request(server)
          .post('/v1/api-keys')
          .set(owner.auth)
          .send({ name: 'a', role: 'admin' })
          .expect(201)
      ).body.secret as string;

      const project = (
        await request(server)
          .post('/v1/projects')
          .set('X-API-Key', memberKey)
          .send({ name: 'p' })
          .expect(201)
      ).body as { id: string };
      // member role cannot delete or read the audit log
      await request(server)
        .delete(`/v1/projects/${project.id}`)
        .set('X-API-Key', memberKey)
        .expect(403);
      await request(server).get('/v1/audit-logs').set('X-API-Key', memberKey).expect(403);
      // admin key can, but API keys can never manage API keys or invitations
      await request(server).get('/v1/audit-logs').set('X-API-Key', adminKey).expect(200);
      await request(server).get('/v1/api-keys').set('X-API-Key', adminKey).expect(403);
      await request(server).get('/v1/invitations').set('X-API-Key', adminKey).expect(403);
      await request(server)
        .delete(`/v1/projects/${project.id}`)
        .set('X-API-Key', adminKey)
        .expect(204);
    });

    it('revoked API keys stop working immediately', async () => {
      const server = app.getHttpServer();
      const owner = await signup(app, 'revoke');
      const created = (
        await request(server).post('/v1/api-keys').set(owner.auth).send({ name: 'tmp' }).expect(201)
      ).body as { secret: string; apiKey: { id: string } };
      await request(server).get('/v1/projects').set('X-API-Key', created.secret).expect(200);
      await request(server).delete(`/v1/api-keys/${created.apiKey.id}`).set(owner.auth).expect(204);
      await request(server).get('/v1/projects').set('X-API-Key', created.secret).expect(401);
    });
  });
});
