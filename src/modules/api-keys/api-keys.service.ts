import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { AppConfig } from '../../config/app-config.service';
import { type ApiKeyPrincipal } from '../../common/types/principal';
import { type Plan, type Role, roleSatisfies } from '../../common/types/roles';
import { hmacSha256, randomBase62, safeEqualHex } from '../../common/utils/crypto';
import { TenancyService } from '../../tenancy/tenancy.service';
import { type AuditActor, AuditService } from '../audit/audit.service';
import { ApiKey } from './api-key.entity';
import { type CreateApiKeyDto } from './dto/api-key.dto';

export const API_KEY_PREFIX = 'nsk';
const API_KEY_PATTERN = /^nsk_([A-Za-z0-9]{12})_([A-Za-z0-9]{40})$/;

export interface CreatedApiKey {
  apiKey: Omit<ApiKey, 'keyHash'>;
  /** Full key. Returned exactly once; only an HMAC is persisted. */
  secret: string;
}

interface ApiKeyLookupRow {
  id: string;
  organization_id: string;
  key_hash: string;
  role: Role;
  expires_at: Date | null;
  revoked_at: Date | null;
  plan: Plan;
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async create(
    actor: AuditActor & { actorId: string },
    actorRole: Role,
    dto: CreateApiKeyDto,
  ): Promise<CreatedApiKey> {
    if (!roleSatisfies(actorRole, dto.role)) {
      throw new ForbiddenException('Cannot create an API key with a higher role than your own');
    }
    const prefix = randomBase62(12);
    const secret = `${API_KEY_PREFIX}_${prefix}_${randomBase62(40)}`;
    const repo = this.tenancy.repository(ApiKey);
    const apiKey = await repo.save(
      repo.create({
        name: dto.name,
        role: dto.role,
        prefix,
        keyHash: this.hash(secret),
        createdByUserId: actor.actorId,
        expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * 86_400_000) : null,
        revokedAt: null,
      }),
    );
    await this.audit.record(actor, {
      action: 'api_key.created',
      entityType: 'api_key',
      entityId: apiKey.id,
      after: { name: apiKey.name, prefix, role: apiKey.role, expiresAt: apiKey.expiresAt },
    });
    const { keyHash: _omit, ...publicFields } = apiKey;
    return { apiKey: publicFields, secret };
  }

  list(): Promise<ApiKey[]> {
    return this.tenancy.repository(ApiKey).find({ order: { createdAt: 'DESC' } });
  }

  async revoke(actor: AuditActor, id: string): Promise<void> {
    const repo = this.tenancy.repository(ApiKey);
    const apiKey = await repo.findOne({ where: { id, revokedAt: IsNull() } });
    if (!apiKey) throw new NotFoundException('API key not found');
    apiKey.revokedAt = new Date();
    await repo.save(apiKey);
    await this.audit.record(actor, {
      action: 'api_key.revoked',
      entityType: 'api_key',
      entityId: id,
      before: { revokedAt: null },
      after: { revokedAt: apiKey.revokedAt },
    });
  }

  /**
   * Authenticates a presented key. Lookup is by the clear-text prefix through a SECURITY DEFINER
   * function (no tenant is known yet); the full key is then verified in constant time.
   */
  async authenticate(raw: string): Promise<ApiKeyPrincipal | null> {
    const match = API_KEY_PATTERN.exec(raw);
    if (!match) return null;
    const rows: ApiKeyLookupRow[] = await this.dataSource.query(
      'SELECT * FROM app_resolve_api_key($1)',
      [match[1]],
    );
    const row = rows[0];
    if (!row || !safeEqualHex(row.key_hash, this.hash(raw))) return null;
    if (row.revoked_at) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
    return {
      type: 'api_key',
      apiKeyId: row.id,
      organizationId: row.organization_id,
      role: row.role,
      plan: row.plan,
    };
  }

  private hash(raw: string): string {
    return hmacSha256(this.config.get('API_KEY_PEPPER'), raw);
  }
}
