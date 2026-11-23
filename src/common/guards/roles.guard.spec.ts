import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MIN_ROLE_KEY, USER_ONLY_KEY } from '../decorators/roles.decorator';
import { type Principal } from '../types/principal';
import { RolesGuard } from './roles.guard';

function contextFor(principal: Principal | undefined): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

const user = (role: Principal['role']): Principal => ({
  type: 'user',
  userId: 'u1',
  organizationId: 'o1',
  role,
  plan: 'free',
  sessionId: 's1',
});
const apiKey: Principal = {
  type: 'api_key',
  apiKeyId: 'k1',
  organizationId: 'o1',
  role: 'admin',
  plan: 'free',
};

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;
  let metadata: Record<string, unknown>;

  beforeEach(() => {
    metadata = {};
    reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => metadata[key as string]);
    guard = new RolesGuard(reflector);
  });

  it('allows routes without role metadata', () => {
    expect(guard.canActivate(contextFor(user('member')))).toBe(true);
  });

  it('enforces the role hierarchy', () => {
    metadata[MIN_ROLE_KEY] = 'admin';
    expect(guard.canActivate(contextFor(user('owner')))).toBe(true);
    expect(guard.canActivate(contextFor(user('admin')))).toBe(true);
    expect(() => guard.canActivate(contextFor(user('member')))).toThrow(ForbiddenException);
  });

  it('rejects API keys on user-only routes even with a sufficient role', () => {
    metadata[USER_ONLY_KEY] = true;
    metadata[MIN_ROLE_KEY] = 'member';
    expect(() => guard.canActivate(contextFor(apiKey))).toThrow('requires a user session');
  });

  it('rejects when no principal is present', () => {
    metadata[MIN_ROLE_KEY] = 'member';
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
