import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager, IsNull } from 'typeorm';
import { type Role, roleSatisfies } from '../../common/types/roles';
import { randomBase62 } from '../../common/utils/crypto';
import { TenancyService } from '../../tenancy/tenancy.service';
import { type AuditActor, AuditService } from '../audit/audit.service';
import { RefreshToken } from '../auth/refresh-token.entity';
import { User } from '../users/user.entity';
import { Membership } from './membership.entity';
import { Organization } from './organization.entity';

export interface MemberView {
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: Date;
}

export interface OrganizationMembershipView {
  organizationId: string;
  name: string;
  slug: string;
  plan: Organization['plan'];
  role: Role;
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBase62(6).toLowerCase()}`;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Must run inside tenancy.run({ organizationId: id }) so the RLS WITH CHECK passes. */
  async createWithOwner(
    manager: EntityManager,
    data: { id: string; name: string; ownerUserId: string },
  ): Promise<Organization> {
    const org = await manager.save(
      manager.create(Organization, { id: data.id, name: data.name, slug: slugify(data.name) }),
    );
    await manager.save(
      manager.create(Membership, {
        organizationId: org.id,
        userId: data.ownerUserId,
        role: 'owner',
      }),
    );
    return org;
  }

  /**
   * Membership of `userId` in `organizationId`, with the organization loaded. Readable under RLS
   * from any context of the same user (the membership policy exposes a user's own rows).
   */
  findMembership(
    userId: string,
    organizationId: string,
  ): Promise<(Membership & { organization: Organization }) | null> {
    return this.tenancy.withUser(
      userId,
      (manager) =>
        manager.findOne(Membership, {
          where: { organizationId, userId },
          relations: { organization: true },
        }) as Promise<(Membership & { organization: Organization }) | null>,
    );
  }

  /** All organizations the user belongs to (RLS exposes the user's own memberships). */
  listForUser(userId: string): Promise<OrganizationMembershipView[]> {
    return this.tenancy.withUser(userId, async (manager) => {
      const memberships = await manager.find(Membership, {
        where: { userId },
        relations: { organization: true },
        order: { createdAt: 'ASC' },
      });
      return memberships.flatMap((m) =>
        m.organization
          ? [
              {
                organizationId: m.organizationId,
                name: m.organization.name,
                slug: m.organization.slug,
                plan: m.organization.plan,
                role: m.role,
              },
            ]
          : [],
      );
    });
  }

  async getCurrent(): Promise<Organization> {
    const org = await this.tenancy
      .manager()
      .findOne(Organization, { where: { id: this.tenancy.organizationId() } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async rename(actor: AuditActor, name: string): Promise<Organization> {
    const org = await this.getCurrent();
    const before = { ...org };
    org.name = name;
    const saved = await this.tenancy.manager().save(org);
    await this.audit.record(actor, {
      action: 'organization.updated',
      entityType: 'organization',
      entityId: org.id,
      before,
      after: saved,
    });
    return saved;
  }

  async listMembers(): Promise<MemberView[]> {
    const rows = await this.tenancy
      .repository(Membership)
      .find({ relations: { user: true }, order: { createdAt: 'ASC' } });
    return rows.map((m) => ({
      userId: m.userId,
      email: m.user?.email ?? '',
      name: m.user?.name ?? '',
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async changeRole(actor: AuditActor, userId: string, role: Role): Promise<MemberView> {
    const repo = this.tenancy.repository(Membership);
    const membership = await repo.findOne({ where: { userId }, relations: { user: true } });
    if (!membership) throw new NotFoundException('Member not found');
    if (membership.role === 'owner' && role !== 'owner') await this.assertNotLastOwner();
    const before = { ...membership, user: undefined };
    membership.role = role;
    await repo.save(membership);
    await this.audit.record(actor, {
      action: 'member.role_changed',
      entityType: 'membership',
      entityId: membership.id,
      before,
      after: { ...membership, user: undefined },
    });
    return {
      userId,
      email: membership.user?.email ?? '',
      name: membership.user?.name ?? '',
      role,
      joinedAt: membership.createdAt,
    };
  }

  async removeMember(actor: AuditActor, actorRole: Role, userId: string): Promise<void> {
    const repo = this.tenancy.repository(Membership);
    const membership = await repo.findOne({ where: { userId } });
    if (!membership) throw new NotFoundException('Member not found');
    if (!roleSatisfies(actorRole, membership.role)) {
      throw new ForbiddenException('Cannot remove a member with a higher role');
    }
    if (membership.role === 'owner') await this.assertNotLastOwner();
    const snapshot = { ...membership };
    await repo.remove(membership);
    await this.tenancy
      .manager()
      .update(
        RefreshToken,
        { userId, organizationId: this.tenancy.organizationId(), revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    await this.audit.record(actor, {
      action: 'member.removed',
      entityType: 'membership',
      entityId: snapshot.id,
      before: snapshot,
    });
  }

  async isMemberByEmail(email: string): Promise<boolean> {
    const count = await this.tenancy
      .manager()
      .createQueryBuilder(Membership, 'm')
      .innerJoin(User, 'u', 'u.id = m.user_id')
      .where('m.organization_id = :orgId', { orgId: this.tenancy.organizationId() })
      .andWhere('u.email = :email', { email })
      .getCount();
    return count > 0;
  }

  private async assertNotLastOwner(): Promise<void> {
    const owners = await this.tenancy.repository(Membership).count({ where: { role: 'owner' } });
    if (owners <= 1) throw new BadRequestException('An organization must keep at least one owner');
  }
}
