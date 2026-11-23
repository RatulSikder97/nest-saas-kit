import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { type App } from 'supertest/types';
import { type AuthTokens } from '../src/modules/auth/token.service';
import { MAILER, type MailMessage, type Mailer } from '../src/modules/mailer/mailer.interface';
import { WorkerModule } from '../src/worker/worker.module';
import { createTestApp, PASSWORD, signup, uniqueEmail, waitFor } from './helpers';

class CapturingMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe('Invitations via transactional outbox -> BullMQ worker -> mailer', () => {
  let app: INestApplication<App>;
  let worker: TestingModule;
  const mailer = new CapturingMailer();

  beforeAll(async () => {
    app = await createTestApp();
    worker = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    worker.enableShutdownHooks();
    await worker.init();
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  const tokenFromMail = async (to: string): Promise<string> => {
    const mail = await waitFor(() => mailer.sent.find((m) => m.to === to));
    const match = /token=([A-Za-z0-9]+)/.exec(mail.text);
    if (!match) throw new Error('no token in invitation email');
    return match[1];
  };

  it('delivers the invitation email and lets a new user join the organization', async () => {
    const server = app.getHttpServer();
    const owner = await signup(app, 'inviter');
    const inviteeEmail = uniqueEmail('invitee');

    const invitation = await request(server)
      .post('/v1/invitations')
      .set(owner.auth)
      .send({ email: inviteeEmail, role: 'member' })
      .expect(201);
    expect(invitation.body).not.toHaveProperty('tokenHash');

    const token = await tokenFromMail(inviteeEmail);
    const joined = await request(server)
      .post('/v1/auth/signup')
      .send({ email: inviteeEmail, password: PASSWORD, name: 'Invitee', invitationToken: token })
      .expect(201);
    const joinedTokens = joined.body as AuthTokens;
    expect(joinedTokens.organizationId).toBe(owner.organizationId);

    const me = await request(server)
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${joinedTokens.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ role: 'member', organizationId: owner.organizationId });

    // Members cannot invite; tokens are single use.
    await request(server)
      .post('/v1/invitations')
      .set('Authorization', `Bearer ${joinedTokens.accessToken}`)
      .send({ email: uniqueEmail(), role: 'member' })
      .expect(403);
    await request(server)
      .post('/v1/auth/signup')
      .send({ email: uniqueEmail(), password: PASSWORD, name: 'x', invitationToken: token })
      .expect(409);
  });

  it('lets an existing user accept, switch organizations, and loses access when removed', async () => {
    const server = app.getHttpServer();
    const owner = await signup(app, 'team-owner');
    const existing = await signup(app, 'existing');

    await request(server)
      .post('/v1/invitations')
      .set(owner.auth)
      .send({ email: existing.email, role: 'admin' })
      .expect(201);
    const token = await tokenFromMail(existing.email);

    // Accepting with the wrong account is refused.
    const stranger = await signup(app, 'stranger');
    await request(server)
      .post('/v1/auth/accept-invitation')
      .set(stranger.auth)
      .send({ token })
      .expect(403);

    const accepted = await request(server)
      .post('/v1/auth/accept-invitation')
      .set(existing.auth)
      .send({ token })
      .expect(200);
    const teamTokens = accepted.body as AuthTokens;
    expect(teamTokens.organizationId).toBe(owner.organizationId);

    const orgs = await request(server).get('/v1/organizations').set(existing.auth).expect(200);
    expect((orgs.body as unknown[]).length).toBe(2);

    const back = await request(server)
      .post('/v1/auth/switch-organization')
      .set('Authorization', `Bearer ${teamTokens.accessToken}`)
      .send({ organizationId: existing.organizationId })
      .expect(200);
    expect((back.body as AuthTokens).organizationId).toBe(existing.organizationId);

    // Owner removes the member: their refresh tokens for that org stop working.
    const meRes = await request(server).get('/v1/auth/me').set(existing.auth).expect(200);
    await request(server)
      .delete(`/v1/organizations/current/members/${meRes.body.id as string}`)
      .set(owner.auth)
      .expect(204);
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: teamTokens.refreshToken })
      .expect(401);
  });
});
