import { randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AppConfig } from '../../config/app-config.service';
import { type Plan, type Role } from '../../common/types/roles';
import { type UserPrincipal } from '../../common/types/principal';
import { randomBase62, safeEqualHex, sha256 } from '../../common/utils/crypto';
import { RefreshToken } from './refresh-token.entity';

export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: Role;
  plan: Plan;
  sid: string;
  typ: 'access';
}

export interface SessionSubject {
  userId: string;
  organizationId: string;
  role: Role;
  plan: Plan;
}

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  organizationId: string;
}

export type RotationResult =
  | { status: 'rotated'; token: RefreshToken; secret: string; previous: RefreshToken }
  | { status: 'invalid' }
  | { status: 'reused'; familyId: string };

const REFRESH_TOKEN_PATTERN = /^([0-9a-f-]{36})\.([A-Za-z0-9]{43})$/;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
  ) {}

  /** Starts a new token family (login / signup / organization switch). */
  async issueSession(subject: SessionSubject): Promise<AuthTokens> {
    const familyId = randomUUID();
    const { token, secret } = await this.createRefreshToken(subject, familyId);
    return this.buildTokens(subject, token, secret);
  }

  async buildTokens(
    subject: SessionSubject,
    token: RefreshToken,
    secret: string,
  ): Promise<AuthTokens> {
    const claims: AccessTokenClaims = {
      sub: subject.userId,
      org: subject.organizationId,
      role: subject.role,
      plan: subject.plan,
      sid: token.familyId,
      typ: 'access',
    };
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync(claims, { expiresIn });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn,
      refreshToken: `${token.id}.${secret}`,
      refreshTokenExpiresAt: token.expiresAt,
      organizationId: subject.organizationId,
    };
  }

  async verifyAccessToken(token: string): Promise<UserPrincipal> {
    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (claims.typ !== 'access') throw new UnauthorizedException('Invalid token type');
    return {
      type: 'user',
      userId: claims.sub,
      organizationId: claims.org,
      role: claims.role,
      plan: claims.plan,
      sessionId: claims.sid,
    };
  }

  /**
   * Rotates a refresh token. The "mark used" UPDATE is a single atomic compare-and-set, so two
   * concurrent refreshes with the same token cannot both succeed: the loser is treated as reuse
   * and the whole family is revoked.
   */
  async rotate(raw: string): Promise<RotationResult> {
    const match = REFRESH_TOKEN_PATTERN.exec(raw);
    if (!match) return { status: 'invalid' };
    const [, id, secret] = match;
    const existing = await this.refreshTokens.findOne({ where: { id } });
    if (!existing || !safeEqualHex(existing.tokenHash, sha256(secret)))
      return { status: 'invalid' };

    if (existing.usedAt || existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      this.logger.warn(
        `refresh token reuse detected; revoked family ${existing.familyId} of user ${existing.userId}`,
      );
      return { status: 'reused', familyId: existing.familyId };
    }
    if (existing.expiresAt.getTime() <= Date.now()) return { status: 'invalid' };

    return this.refreshTokens.manager.transaction(async (manager) => {
      const nextId = randomUUID();
      const claimed = await manager
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ usedAt: () => 'now()', replacedById: nextId })
        .where({ id, usedAt: IsNull(), revokedAt: IsNull() })
        .execute();
      if (claimed.affected !== 1) {
        await manager.update(
          RefreshToken,
          { familyId: existing.familyId, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        return { status: 'reused', familyId: existing.familyId } as const;
      }
      const nextSecret = randomBase62(43);
      const next = await manager.save(
        manager.create(RefreshToken, {
          id: nextId,
          familyId: existing.familyId,
          userId: existing.userId,
          organizationId: existing.organizationId,
          tokenHash: sha256(nextSecret),
          // Rotation does not extend the absolute session lifetime.
          expiresAt: existing.expiresAt,
        }),
      );
      return { status: 'rotated', token: next, secret: nextSecret, previous: existing } as const;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refreshTokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Resolves the family of a presented token without rotating it (used by logout). */
  async findFamily(raw: string): Promise<RefreshToken | null> {
    const match = REFRESH_TOKEN_PATTERN.exec(raw);
    if (!match) return null;
    const [, id, secret] = match;
    const token = await this.refreshTokens.findOne({ where: { id } });
    return token && safeEqualHex(token.tokenHash, sha256(secret)) ? token : null;
  }

  private async createRefreshToken(
    subject: SessionSubject,
    familyId: string,
  ): Promise<{ token: RefreshToken; secret: string }> {
    const secret = randomBase62(43);
    const ttlMs = this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000;
    const token = await this.refreshTokens.save(
      this.refreshTokens.create({
        id: randomUUID(),
        familyId,
        userId: subject.userId,
        organizationId: subject.organizationId,
        tokenHash: sha256(secret),
        expiresAt: new Date(Date.now() + ttlMs),
      }),
    );
    return { token, secret };
  }
}
