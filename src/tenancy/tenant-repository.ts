import {
  type DeepPartial,
  type EntityTarget,
  type FindManyOptions,
  type FindOneOptions,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { TenantViolationError } from './tenant-context';
import { type TenantScopedEntity } from './tenant-scoped.entity';

interface TenantScopeSource {
  manager(): { getRepository<E extends object>(target: EntityTarget<E>): Repository<E> };
  organizationId(): string;
}

/**
 * Application-layer tenant isolation: every read is constrained to the current organization and
 * every write is stamped with it. Postgres RLS enforces the same rule underneath as a second line
 * of defence, so a forgotten filter fails closed instead of leaking data.
 */
export class TenantRepository<T extends TenantScopedEntity> {
  constructor(
    private readonly target: EntityTarget<T>,
    private readonly tenancy: TenantScopeSource,
  ) {}

  /** Raw repository bound to the tenant transaction (RLS still applies). */
  get raw(): Repository<T> {
    return this.tenancy.manager().getRepository(this.target);
  }

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.raw.find({ ...options, where: this.scope(options.where) });
  }

  findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.raw.findAndCount({ ...options, where: this.scope(options.where) });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.raw.findOne({ ...options, where: this.scope(options.where) });
  }

  count(options: FindManyOptions<T> = {}): Promise<number> {
    return this.raw.count({ ...options, where: this.scope(options.where) });
  }

  create(data: DeepPartial<T>): T {
    const entity = this.raw.create(data);
    entity.organizationId = this.tenancy.organizationId();
    return entity;
  }

  save(entity: T): Promise<T> {
    this.assertOwned(entity);
    return this.raw.save(entity);
  }

  async remove(entity: T): Promise<void> {
    this.assertOwned(entity);
    await this.raw.remove(entity);
  }

  private assertOwned(entity: T): void {
    const orgId = this.tenancy.organizationId();
    if (entity.organizationId === undefined) entity.organizationId = orgId;
    if (entity.organizationId !== orgId) {
      throw new TenantViolationError(
        'Refusing to write an entity that belongs to another organization',
      );
    }
  }

  private scope(
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[] | undefined,
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    // FindOptionsWhere<T> is a mapped type TS cannot narrow for a generic T; the spread is safe
    // because every T extends TenantScopedEntity and therefore has organizationId.
    const tenantFilter = { organizationId: this.tenancy.organizationId() } as FindOptionsWhere<T>;
    if (Array.isArray(where)) return where.map((w) => ({ ...w, ...tenantFilter }));
    return { ...(where ?? {}), ...tenantFilter };
  }
}
