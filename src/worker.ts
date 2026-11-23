import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerModule } from './worker/worker.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // SIGTERM/SIGINT close BullMQ workers (finishing in-flight jobs), DB pool and Redis.
  app.enableShutdownHooks();
  await app.init();
}

main().catch((err: unknown) => {
  console.error('fatal: failed to start', err);
  process.exit(1);
});
