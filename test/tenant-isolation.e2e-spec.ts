import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource, QueryFailedError } from 'typeorm';
import { Project } from '../src/modules/projects/project.entity';
import { TenantViolationError } from '../src/tenancy/tenant-context';
import { TenancyService } from '../src/tenancy/tenancy.service';
import { createTestApp, signup, type TestTenant } from './helpers';

describe('Tenant isolation (app layer + Postgres RLS)', () => {
  let app: INestApplication<App>;
  let orgA: TestTenant;
  let orgB: TestTenant;
  let projectA: { id: string };
  let apiKeyB: string;

  beforeAll(async () => {
    app = await createTestApp();
    orgA = await signup(app, 'alice');
    orgB = await signup(app, 'bob');
    projectA = (
      await request(app.getHttpServer())
        .post('/v1/projects')
        .set(orgA.auth)
        .send({ name: 'A secret project' })
        .expect(201)
    ).body as { id: string };
    apiKeyB = (
      (
        await request(app.getHttpServer())
          .post('/v1/api-keys')
          .set(orgB.auth)
          .send({ name: 'b-key', role: 'admin' })
          .expect(201)
      ).body as { secret: string }
    ).secret;
  });

  afterAll(() => app.close());

  describe('over HTTP', () => {
    it('org B cannot read, list, update or delete org A resources', async () => {
      const server = app.getHttpServer();
      await request(server).get(`/v1/projects/${projectA.id}`).set(orgB.auth).expect(404);
      await request(server)
        .patch(`/v1/projects/${projectA.id}`)
        .set(orgB.auth)
        .send({ name: 'pwned' })
        .expect(404);
      await request(server).delete(`/v1/projects/${projectA.id}`).set(orgB.auth).expect(404);
      const list = await request(server).get('/v1/projects').set(orgB.auth).expect(200);
      expect(list.body).toMatchObject({ total: 0, items: [] });

      // Org A still sees its untouched project.
      const own = await request(server)
        .get(`/v1/projects/${projectA.id}`)
        .set(orgA.auth)
        .expect(200);
      expect(own.body).toMatchObject({ name: 'A secret project' });
    });

    it('API keys are confined to their organization', async () => {
      const server = app.getHttpServer();
      await request(server)
        .get(`/v1/projects/${projectA.id}`)
        .set('X-API-Key', apiKeyB)
        .expect(404);
      const current = await request(server)
        .get('/v1/organizations/current')
        .set('X-API-Key', apiKeyB)
        .expect(200);
      expect(current.body.id).toBe(orgB.organizationId);
    });

    it('audit logs and members never include another organization', async () => {
      const server = app.getHttpServer();
      const logs = await request(server).get('/v1/audit-logs?limit=100').set(orgB.auth).expect(200);
      const items = logs.body.items as Array<{ organizationId: string; entityId: string }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((l) => l.organizationId === orgB.organizationId)).toBe(true);
      expect(items.some((l) => l.entityId === projectA.id)).toBe(false);

      const members = await request(server).get('/v1/organizations/current/members').set(orgB.auth);
      expect((members.body as Array<{ email: string }>).map((m) => m.email)).toEqual([orgB.email]);
    });

    it('a token cannot be used to switch into an organization the user does not belong to', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/switch-organization')
        .set(orgB.auth)
        .send({ organizationId: orgA.organizationId })
        .expect(403);
    });
  });

  describe('in the database (RLS), bypassing the application filters', () => {
    let dataSource: DataSource;
    let tenancy: TenancyService;

    beforeAll(() => {
      dataSource = app.get(DataSource);
      tenancy = app.get(TenancyService);
    });

    it('the runtime role is neither superuser nor BYPASSRLS', async () => {
      const [role] = await dataSource.query<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>(
        'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
      );
      expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it('raw SQL in org B context cannot see org A rows', async () => {
      const rows = await tenancy.run({ organizationId: orgB.organizationId }, (m) =>
        m.query('SELECT id FROM projects WHERE id = $1', [projectA.id]),
      );
      expect(rows).toEqual([]);
      const orgs = await tenancy.run({ organizationId: orgB.organizationId }, (m) =>
        m.query<Array<{ id: string }>>('SELECT id FROM organizations'),
      );
      expect(orgs.map((o) => o.id)).toEqual([orgB.organizationId]);
    });

    it('queries without a tenant context fail closed (see nothing)', async () => {
      const [{ n }] = await dataSource.query<Array<{ n: number }>>(
        'SELECT count(*)::int AS n FROM projects',
      );
      expect(n).toBe(0);
    });

    it('raw UPDATE/DELETE against another tenant affect zero rows', async () => {
      const result = await tenancy.run({ organizationId: orgB.organizationId }, async (m) => {
        const [, updated] = await m.query<[unknown, number]>(
          `UPDATE projects SET name = 'pwned' WHERE id = $1`,
          [projectA.id],
        );
        const [, deleted] = await m.query<[unknown, number]>('DELETE FROM projects WHERE id = $1', [
          projectA.id,
        ]);
        return { updated, deleted };
      });
      expect(result).toEqual({ updated: 0, deleted: 0 });
    });

    it('raw INSERT of a row for another tenant is rejected by the RLS WITH CHECK', async () => {
      const attempt = tenancy.run({ organizationId: orgB.organizationId }, (m) =>
        m.query(
          `INSERT INTO projects (organization_id, name, created_by) VALUES ($1, 'x', gen_random_uuid())`,
          [orgA.organizationId],
        ),
      );
      await expect(attempt).rejects.toBeInstanceOf(QueryFailedError);
      await expect(attempt).rejects.toMatchObject({ driverError: { code: '42501' } });
    });

    it('the ORM subscriber blocks cross-tenant writes before they reach SQL', async () => {
      const attempt = tenancy.run({ organizationId: orgB.organizationId }, (m) =>
        m.save(
          m.create(Project, {
            organizationId: orgA.organizationId,
            name: 'x',
            createdBy: orgB.organizationId,
          }),
        ),
      );
      await expect(attempt).rejects.toBeInstanceOf(TenantViolationError);
    });
  });
});
