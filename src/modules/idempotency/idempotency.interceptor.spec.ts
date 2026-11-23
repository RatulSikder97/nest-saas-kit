import {
  BadRequestException,
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  UnprocessableEntityException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { lastValueFrom, NEVER, of, throwError } from 'rxjs';
import { type AppConfig } from '../../config/app-config.service';
import { IdempotencyInterceptor, REPLAYED_HEADER } from './idempotency.interceptor';

/** Minimal in-memory stand-in for the subset of ioredis used by the interceptor. */
class FakeRedis {
  store = new Map<string, string>();
  set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    if (args.includes('NX') && this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, value);
    return Promise.resolve('OK');
  }
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
  del(key: string): Promise<number> {
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }
}

describe('IdempotencyInterceptor', () => {
  let redis: FakeRedis;
  let interceptor: IdempotencyInterceptor;
  const principal = {
    type: 'user',
    userId: 'u1',
    organizationId: 'o1',
    role: 'member',
    plan: 'free',
  };

  const context = (body: unknown, key: string | null = 'key-1', method = 'POST') => {
    const headers: Record<string, string> = {};
    const res = { setHeader: jest.fn((name: string, value: string) => (headers[name] = value)) };
    const req = {
      method,
      originalUrl: '/v1/projects',
      body,
      principal,
      headers: key === null ? {} : { 'idempotency-key': key },
    };
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    return { ctx, headers };
  };
  const handler = (value: unknown): CallHandler & { calls: number } => {
    const h = {
      calls: 0,
      handle: () => {
        h.calls++;
        return of(value);
      },
    };
    return h;
  };

  beforeEach(() => {
    redis = new FakeRedis();
    const config = {
      get: (k: string) => (k === 'IDEMPOTENCY_TTL_SECONDS' ? 3600 : 30),
    } as unknown as AppConfig;
    interceptor = new IdempotencyInterceptor(redis as unknown as Redis, config);
  });

  it('passes through requests without a key or non-POST methods', async () => {
    const h = handler({ ok: true });
    await lastValueFrom(interceptor.intercept(context({}, null).ctx, h));
    await lastValueFrom(interceptor.intercept(context({}, 'k', 'GET').ctx, h));
    expect(h.calls).toBe(2);
    expect(redis.store.size).toBe(0);
  });

  it('replays the first response for a retry with the same key and payload', async () => {
    const first = handler({ id: 'p1' });
    await expect(
      lastValueFrom(interceptor.intercept(context({ name: 'a' }).ctx, first)),
    ).resolves.toEqual({ id: 'p1' });

    const retry = handler({ id: 'p2' });
    const { ctx, headers } = context({ name: 'a' });
    await expect(lastValueFrom(interceptor.intercept(ctx, retry))).resolves.toEqual({ id: 'p1' });
    expect(retry.calls).toBe(0);
    expect(headers[REPLAYED_HEADER]).toBe('true');
  });

  it('rejects reuse of a key with a different payload', async () => {
    await lastValueFrom(interceptor.intercept(context({ name: 'a' }).ctx, handler({})));
    await expect(
      lastValueFrom(interceptor.intercept(context({ name: 'b' }).ctx, handler({}))),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns 409 while the original request is still in flight', async () => {
    const inflight = interceptor.intercept(context({ name: 'a' }).ctx, { handle: () => NEVER });
    const sub = inflight.subscribe();
    await new Promise((r) => setImmediate(r));
    await expect(
      lastValueFrom(interceptor.intercept(context({ name: 'a' }).ctx, handler({}))),
    ).rejects.toThrow(ConflictException);
    sub.unsubscribe();
  });

  it('releases the key when the handler fails so the client can retry', async () => {
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };
    await expect(
      lastValueFrom(interceptor.intercept(context({ name: 'a' }).ctx, failing)),
    ).rejects.toThrow('boom');
    const retry = handler({ id: 'ok' });
    await expect(
      lastValueFrom(interceptor.intercept(context({ name: 'a' }).ctx, retry)),
    ).resolves.toEqual({ id: 'ok' });
    expect(retry.calls).toBe(1);
  });

  it('validates the key format', () => {
    expect(() => interceptor.intercept(context({}, 'has spaces').ctx, handler({}))).toThrow(
      BadRequestException,
    );
  });
});
