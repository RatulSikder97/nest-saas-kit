import { Injectable } from '@nestjs/common';
import { type Paginated, type PaginationQuery } from '../../common/utils/pagination';
import { jsonDiff } from '../../common/utils/json-diff';
import { TenancyService } from '../../tenancy/tenancy.service';
import { type AuditActorType, AuditLog } from './audit-log.entity';

export interface AuditActor {
  actorType: AuditActorType;
  actorId: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/** Fields never copied into audit diffs. */
const REDACTED = ['updatedAt', 'passwordHash', 'keyHash', 'tokenHash'];

@Injectable()
export class AuditService {
  constructor(private readonly tenancy: TenancyService) {}

  /**
   * Appends an audit row inside the current tenant transaction, so the audit trail commits or
   * rolls back atomically with the change it describes.
   */
  async record(actor: AuditActor, entry: AuditEntry): Promise<AuditLog> {
    const repo = this.tenancy.repository(AuditLog);
    const log = repo.create({
      actorType: actor.actorType,
      actorId: actor.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: jsonDiff(entry.before, entry.after, REDACTED),
      requestId: this.tenancy.requestId(),
    });
    return repo.save(log);
  }

  async list(
    query: PaginationQuery,
    filter: { entityType?: string; entityId?: string },
  ): Promise<Paginated<AuditLog>> {
    const where = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    };
    const [items, total] = await this.tenancy.repository(AuditLog).findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }
}
