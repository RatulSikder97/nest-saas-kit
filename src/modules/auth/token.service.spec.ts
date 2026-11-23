import { JwtService } from '@nestjs/jwt';
import { type Repository } from 'typeorm';
import { type AppConfig } from '../../config/app-config.service';
import { sha256 } from '../../common/utils/crypto';
import { type RefreshToken } from './refresh-token.entity';
import { TokenService } from './token.service';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SECRET = 'A'.repeat(43);

function storedToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: ID,
    familyId: 'family-1',
    userId: 'user-1',
    organizationId: 'org-1',
    tokenHash: sha256(SECRET),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    revokedAt: null,
    replacedById: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('TokenService', () => {
  let repo: {
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let txManager: {
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let claimAffected: number;
  let service: TokenService;

  beforeEach(() => {
    claimAffected = 1;
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(() => Promise.resolve({ affected: claimAffected })),
    };
    txManager = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      create: jest.fn((_e: unknown, data: object) => data),
      save: jest.fn((e: object) => Promise.resolve(e)),
    };
    repo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 3 }),
      create: jest.fn((data: object) => data),
      save: jest.fn((e: object) => Promise.resolve(e)),
      manager: { transaction: jest.fn((fn: (m: typeof txManager) => unknown) => fn(txManager)) },
    };
    const config = {
      get: (key: string) => ({ ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_DAYS: 30 })[key],
    } as unknown as AppConfig;
    service = new TokenService(
      new JwtService({ secret: 's'.repeat(32), signOptions: { algorithm: 'HS256' } }),
      config,
      repo as unknown as Repository<RefreshToken>,
    );
  });

  it('rejects malformed tokens without touching the database', async () => {
    await expect(service.rotate('garbage')).resolves.toEqual({ status: 'invalid' });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a token whose secret does not match the stored hash', async () => {
    repo.findOne.mockResolvedValue(storedToken());
    await expect(service.rotate(`${ID}.${'B'.repeat(43)}`)).resolves.toEqual({ status: 'invalid' });
  });

  it('rotates a valid token within the same family and keeps the absolute expiry', async () => {
    const existing = storedToken();
    repo.findOne.mockResolvedValue(existing);
    const result = await service.rotate(`${ID}.${SECRET}`);
    expect(result.status).toBe('rotated');
    if (result.status !== 'rotated') return;
    expect(result.token.familyId).toBe('family-1');
    expect(result.token.expiresAt).toBe(existing.expiresAt);
    expect(result.token.tokenHash).toBe(sha256(result.secret));
  });

  it('revokes the whole family when an already-used token is presented (reuse detection)', async () => {
    repo.findOne.mockResolvedValue(storedToken({ usedAt: new Date() }));
    await expect(service.rotate(`${ID}.${SECRET}`)).resolves.toEqual({
      status: 'reused',
      familyId: 'family-1',
    });
    expect(repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'family-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });

  it('treats losing a concurrent rotation race as reuse', async () => {
    repo.findOne.mockResolvedValue(storedToken());
    claimAffected = 0;
    await expect(service.rotate(`${ID}.${SECRET}`)).resolves.toMatchObject({ status: 'reused' });
    expect(txManager.update).toHaveBeenCalled();
    expect(txManager.save).not.toHaveBeenCalled();
  });

  it('issues verifiable access tokens carrying tenant claims', async () => {
    const tokens = await service.issueSession({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'admin',
      plan: 'pro',
    });
    expect(tokens.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9]{43}$/);
    await expect(service.verifyAccessToken(tokens.accessToken)).resolves.toMatchObject({
      type: 'user',
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'admin',
      plan: 'pro',
    });
    await expect(service.verifyAccessToken(`${tokens.accessToken}x`)).rejects.toThrow(
      'Invalid or expired',
    );
  });
});
