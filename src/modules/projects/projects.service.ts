import { Injectable, NotFoundException } from '@nestjs/common';
import { type Paginated, type PaginationQuery } from '../../common/utils/pagination';
import { TenancyService } from '../../tenancy/tenancy.service';
import { type TenantRepository } from '../../tenancy/tenant-repository';
import { type AuditActor, AuditService } from '../audit/audit.service';
import { type CreateProjectDto, type UpdateProjectDto } from './dto/project.dto';
import { Project } from './project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  private get repo(): TenantRepository<Project> {
    return this.tenancy.repository(Project);
  }

  async list(query: PaginationQuery): Promise<Paginated<Project>> {
    const [items, total] = await this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  async get(id: string): Promise<Project> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(actor: AuditActor & { actorId: string }, dto: CreateProjectDto): Promise<Project> {
    const project = await this.repo.save(
      this.repo.create({
        name: dto.name,
        description: dto.description ?? null,
        createdBy: actor.actorId,
      }),
    );
    await this.audit.record(actor, {
      action: 'project.created',
      entityType: 'project',
      entityId: project.id,
      after: project,
    });
    return project;
  }

  async update(actor: AuditActor, id: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.get(id);
    const before = { ...project };
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    const saved = await this.repo.save(project);
    await this.audit.record(actor, {
      action: 'project.updated',
      entityType: 'project',
      entityId: id,
      before,
      after: saved,
    });
    return saved;
  }

  async remove(actor: AuditActor, id: string): Promise<void> {
    const project = await this.get(id);
    const before = { ...project };
    await this.repo.remove(project);
    await this.audit.record(actor, {
      action: 'project.deleted',
      entityType: 'project',
      entityId: id,
      before,
    });
  }
}
