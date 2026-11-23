import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Response } from 'express';
import type Redis from 'ioredis';
import { catchError, from, mergeMap, type Observable, of, switchMap } from 'rxjs';
import { AppConfig } from '../../config/app-config.service';
import { type AuthenticatedRequest } from '../../common/types/principal';
import { sha256 } from '../../common/utils/crypto';
import { REDIS } from '../../redis/redis.constants';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'Idempotent-Replayed';
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{1,255}$/;

type IdempotencyRecord =
  | { state: 'processing'; fingerprint: string }
  | { state: 'completed'; fingerprint: string; body: unknown };

/**
 * Idempotency-Key support for POST requests (Stripe semantics):
 *  - first request with a key runs and its successful response is cached for the TTL,
 *  - retries with the same key and same payload replay the cached response,
 *  - retries while the first is still running get 409, a different payload gets 422,
 *  - failed requests release the key so the client can retry.
 *
 * Keys are scoped per principal (organization + user/API key, or client IP when anonymous), so one
 * tenant can never observe another tenant's cached response. Implemented as an interceptor rather
 * than raw middleware because it needs the authenticated principal and the handler's return value.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const rawKey = req.headers[IDEMPOTENCY_HEADER];
    if (req.method !== 'POST' || rawKey === undefined) return next.handle();
    if (typeof rawKey !== 'string' || !KEY_PATTERN.test(rawKey)) {
      throw new BadRequestException('Idempotency-Key must be 1-255 characters of [A-Za-z0-9_-:.]');
    }

    const res = http.getResponse<Response>();
    const redisKey = `idem:${this.scope(req)}:${sha256(rawKey)}`;
    const fingerprint = sha256(
      `${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? null)}`,
    );
    const ttl = this.config.get('IDEMPOTENCY_TTL_SECONDS');
    const lockTtl = this.config.get('IDEMPOTENCY_LOCK_TTL_SECONDS');

    return from(this.acquire(redisKey, fingerprint, lockTtl)).pipe(
      switchMap((cached) => {
        if (cached) {
          res.setHeader(REPLAYED_HEADER, 'true');
          return of(cached.body);
        }
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            const record: IdempotencyRecord = { state: 'completed', fingerprint, body };
            await this.redis.set(redisKey, JSON.stringify(record), 'EX', ttl);
            return body;
          }),
          catchError((err: unknown) =>
            from(this.redis.del(redisKey)).pipe(
              mergeMap(() => {
                throw err;
              }),
            ),
          ),
        );
      }),
    );
  }

  /** Returns the cached completion to replay, or null if this request now owns the key. */
  private async acquire(
    redisKey: string,
    fingerprint: string,
    lockTtl: number,
  ): Promise<Extract<IdempotencyRecord, { state: 'completed' }> | null> {
    const lock: IdempotencyRecord = { state: 'processing', fingerprint };
    const acquired = await this.redis.set(redisKey, JSON.stringify(lock), 'EX', lockTtl, 'NX');
    if (acquired === 'OK') return null;

    const existingRaw = await this.redis.get(redisKey);
    if (!existingRaw) {
      throw new ConflictException('Idempotency key state changed concurrently; retry');
    }
    const existing = JSON.parse(existingRaw) as IdempotencyRecord;
    if (existing.fingerprint !== fingerprint) {
      throw new UnprocessableEntityException(
        'Idempotency-Key was already used with a different request payload',
      );
    }
    if (existing.state === 'processing') {
      throw new ConflictException('A request with this Idempotency-Key is still in progress');
    }
    return existing;
  }

  private scope(req: AuthenticatedRequest): string {
    const p = req.principal;
    if (!p) return `anon:${req.ip ?? 'unknown'}`;
    return p.type === 'user'
      ? `${p.organizationId}:u:${p.userId}`
      : `${p.organizationId}:k:${p.apiKeyId}`;
  }
}
