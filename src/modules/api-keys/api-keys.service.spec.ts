import { ForbiddenException } from '@nestjs/common';
import { type DataSource } from 'typeorm';
import { type AppConfig } from '../../config/app-config.service';
import { hmacSha256 } from '../../common/utils/crypto';
import { type TenancyService } from '../../tenancy/tenancy.service';
import { type AuditService } from '../audit/audit.service';
import { ApiKeysService } from './api-keys.service';

const PEPPER = 'p'.repeat(32);
const KEY = `nsk_ABCDEFGHIJKL_${'x'.repeat(40)}`;

describe('ApiKeysService.authenticate', () => {
  let query: jest.Mock;
  let service: ApiKeysService;
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: 'k1',
    organization_id: 'o1',
    key_hash: hmacSha256(PEPPER, KEY),
    role: 'member',
    expires_at: null,
    revoked_at: null,
    plan: 'pro',
    ...overrides,
  });

  beforeEach(() => {
    query = jest.fn();
    service = new ApiKeysService(
      { query } as unknown as DataSource,
      {} as TenancyService,
      {} as AuditService,
      { get: () => PEPPER } as unknown as AppConfig,
    );
  });

  it('ignores strings that are not API keys without querying', async () => {
    await expect(service.authenticate('Bearer x')).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('looks the key up by prefix and verifies the HMAC', async () => {
    query.mockResolvedValue([row()]);
    await expect(service.authenticate(KEY)).resolves.toEqual({
      type: 'api_key',
      apiKeyId: 'k1',
      organizationId: 'o1',
      role: 'member',
      plan: 'pro',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('app_resolve_api_key'), [
      'ABCDEFGHIJKL',
    ]);
  });

  it.each([
    ['wrong secret', { key_hash: hmacSha256(PEPPER, 'other') }],
    ['revoked', { revoked_at: new Date() }],
    ['expired', { expires_at: new Date(Date.now() - 1000) }],
  ])('rejects %s keys', async (_label, overrides) => {
    query.mockResolvedValue([row(overrides)]);
    await expect(service.authenticate(KEY)).resolves.toBeNull();
  });

  it('prevents privilege escalation when minting keys', async () => {
    await expect(
      service.create({ actorType: 'user', actorId: 'u1' }, 'member', { name: 'k', role: 'admin' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
