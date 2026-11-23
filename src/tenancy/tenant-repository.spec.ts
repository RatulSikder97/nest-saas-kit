import { type Repository } from 'typeorm';
import { TenantRepository } from './tenant-repository';
import { TenantScopedEntity } from './tenant-scoped.entity';

class Widget extends TenantScopedEntity {
  id!: string;
  name!: string;
}

describe('TenantRepository', () => {
  const ORG = '11111111-1111-1111-1111-111111111111';
  let raw: jest.Mocked<
    Pick<
      Repository<Widget>,
      'find' | 'findOne' | 'count' | 'save' | 'remove' | 'create' | 'findAndCount'
    >
  >;
  let repo: TenantRepository<Widget>;

  beforeEach(() => {
    raw = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn((e: Widget) => Promise.resolve(e)) as never,
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((d: Partial<Widget>) => Object.assign(new Widget(), d)) as never,
    };
    repo = new TenantRepository(Widget, {
      manager: () => ({
        getRepository: <E extends object>() => raw as unknown as Repository<E>,
      }),
      organizationId: () => ORG,
    });
  });

  it('adds the tenant filter to reads and overrides any caller-supplied organization', async () => {
    await repo.find({ where: { name: 'x', organizationId: 'someone-else' } });
    expect(raw.find).toHaveBeenCalledWith({ where: { name: 'x', organizationId: ORG } });
    await repo.findOne({ where: [{ id: 'a' }, { id: 'b' }] });
    expect(raw.findOne).toHaveBeenCalledWith({
      where: [
        { id: 'a', organizationId: ORG },
        { id: 'b', organizationId: ORG },
      ],
    });
    await repo.count();
    expect(raw.count).toHaveBeenCalledWith({ where: { organizationId: ORG } });
  });

  it('stamps new entities with the current organization', () => {
    const w = repo.create({ name: 'n', organizationId: 'spoofed' });
    expect(w.organizationId).toBe(ORG);
  });

  it('refuses to write entities owned by another organization', async () => {
    const foreign = Object.assign(new Widget(), { id: 'w', organizationId: 'other-org' });
    expect(() => repo.save(foreign)).toThrow('belongs to another organization');
    await expect(async () => repo.remove(foreign)).rejects.toThrow('another organization');
    expect(raw.save).not.toHaveBeenCalled();
  });
});
