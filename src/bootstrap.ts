import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/app-config.service';
import { API_KEY_HEADER } from './common/guards/authentication.guard';

export const API_PREFIX = 'v1';

/** Shared HTTP setup for main.ts and the e2e suite, so tests exercise the real pipeline. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.disable('x-powered-by');
  if (config.get('TRUST_PROXY')) app.set('trust proxy', true);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health/live', 'health/ready'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.get('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('nest-saas-kit API')
        .setDescription('Multi-tenant SaaS backend starter')
        .setVersion('1.0')
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'api-key')
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  return app;
}
