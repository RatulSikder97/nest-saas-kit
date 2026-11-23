import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { AuthService } from '../../modules/auth/auth.service';
import { ProjectsService } from '../../modules/projects/projects.service';
import { UsersService } from '../../modules/users/users.service';
import { TenancyService } from '../../tenancy/tenancy.service';
import { loadDotEnv } from './load-env';

const DEMO = {
  email: 'owner@example.com',
  password: 'demo-password-change-me',
  name: 'Demo Owner',
  organizationName: 'Demo Inc',
};

/** Idempotent demo data: one owner, one organization, one project, one API key. */
async function seed(): Promise<void> {
  loadDotEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    if (await app.get(UsersService).findByEmailWithPassword(DEMO.email)) {
      console.log(`seed: ${DEMO.email} already exists, nothing to do`);
      return;
    }
    const tokens = await app.get(AuthService).signup(DEMO);
    const user = await app.get(UsersService).findByEmailWithPassword(DEMO.email);
    if (!user) throw new Error('seed: user was not created');
    const actor = { actorType: 'user' as const, actorId: user.id };

    const { secret } = await app
      .get(TenancyService)
      .run({ organizationId: tokens.organizationId, userId: user.id }, async () => {
        await app.get(ProjectsService).create(actor, {
          name: 'Getting started',
          description: 'Created by the seed script',
        });
        return app.get(ApiKeysService).create(actor, 'owner', { name: 'seed key', role: 'member' });
      });

    console.log('seed: created demo data');
    console.log(`  login:        ${DEMO.email} / ${DEMO.password}`);
    console.log(`  organization: ${tokens.organizationId}`);
    console.log(`  api key:      ${secret}`);
  } finally {
    await app.close();
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
