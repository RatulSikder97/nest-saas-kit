import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { type TokenService } from '../../modules/auth/token.service';
import { type AuthenticatedRequest, type Principal } from '../types/principal';
import { AuthenticationGuard } from './authentication.guard';

describe('AuthenticationGuard', () => {
  const userPrincipal: Principal = {
    type: 'user',
    userId: 'u1',
    organizationId: 'o1',
    role: 'member',
    plan: 'free',
    sessionId: 's1',
  };
  const keyPrincipal: Principal = {
    type: 'api_key',
    apiKeyId: 'k1',
    organizationId: 'o1',
    role: 'member',
    plan: 'pro',
  };
  let tokens: jest.Mocked<Pick<TokenService, 'verifyAccessToken'>>;
  let apiKeys: jest.Mocked<Pick<ApiKeysService, 'authenticate'>>;
  let reflector: Reflector;
  let guard: AuthenticationGuard;

  const run = async (headers: Record<string, string>, isPublic = false) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    const req = { headers } as unknown as AuthenticatedRequest;
    const ctx = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const result = await guard.canActivate(ctx);
    return { result, req };
  };

  beforeEach(() => {
    tokens = { verifyAccessToken: jest.fn() };
    apiKeys = { authenticate: jest.fn() };
    reflector = new Reflector();
    guard = new AuthenticationGuard(
      reflector,
      tokens as unknown as TokenService,
      apiKeys as unknown as ApiKeysService,
    );
  });

  it('lets public routes through without credentials', async () => {
    await expect(run({}, true)).resolves.toMatchObject({ result: true });
  });

  it('attaches the principal from a bearer token', async () => {
    tokens.verifyAccessToken.mockResolvedValue(userPrincipal);
    const { req } = await run({ authorization: 'Bearer abc' });
    expect(tokens.verifyAccessToken).toHaveBeenCalledWith('abc');
    expect(req.principal).toEqual(userPrincipal);
  });

  it('attaches the principal from an API key', async () => {
    apiKeys.authenticate.mockResolvedValue(keyPrincipal);
    const { req } = await run({ 'x-api-key': 'nsk_x' });
    expect(req.principal).toEqual(keyPrincipal);
  });

  it('rejects unknown API keys and missing credentials', async () => {
    apiKeys.authenticate.mockResolvedValue(null);
    await expect(run({ 'x-api-key': 'nsk_bad' })).rejects.toThrow(UnauthorizedException);
    await expect(run({})).rejects.toThrow('Missing credentials');
  });
});
