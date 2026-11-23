import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config.service';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

/** Reuses a well-formed inbound X-Request-Id (from a gateway) or mints one, and echoes it back. */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: requestIdFor,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
          },
          customProps: (req: IncomingMessage & { principal?: { organizationId: string } }) =>
            req.principal ? { organizationId: req.principal.organizationId } : {},
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
