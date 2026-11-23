import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfig } from './config/app-config.service';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  await app.listen(app.get(AppConfig).get('PORT'), '0.0.0.0');
}

main().catch((err: unknown) => {
  console.error('fatal: failed to start', err);
  process.exit(1);
});
