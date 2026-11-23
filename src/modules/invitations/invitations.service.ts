import { ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { AppConfig } from '../../config/app-config.service';
import { randomBase62, sha256 } from '../../common/utils/crypto';
import { TenancyService } from '../../tenancy/tenancy.service';
import { type AuditActor, AuditService } from '../audit/audit.service';
import { Membership } from '../organizations/membership.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  DomainEvents,
  type InvitationCreatedPayload,
  OutboxService,
} from '../outbox/outbox.service';
import { normalizeEmail } from '../users/users.service';
import { type CreateInvitationDto } from './dto/invitation.dto';
import { Invitation } from './invitation.entity';

export type InvitationView = Omit<Invitation, 'tokenHash'>;

export interface PendingInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: Invitation['role'];
}

interface InvitationLookupRow {
  id: string;
  organization_id: string;
  email: string;
  role: Invitation['role'];
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

@Injectable()
export class InvitationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenancy: TenancyService,
    private readonly organizations: OrganizationsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Creates an invitation and stages an `invitation.created` event in the same transaction.
   * The raw token only ever exists in the outbox payload / email, never in the invitations table.
   */
  async create(
    actor: AuditActor & { actorId: string },
    dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    const email = normalizeEmail(dto.email);
    if (await this.organizations.isMemberByEmail(email)) {
      throw new ConflictException('User is already a member of this organization');
    }
    const token = randomBase62(43);
    const ttlMs = this.config.get('INVITATION_TTL_HOURS') * 60 * 60 * 1000;
    const repo = this.tenancy.repository(Invitation);
    const invitation = await repo.save(
      repo.create({
        email,
        role: dto.role,
        tokenHash: sha256(token),
        invitedByUserId: actor.actorId,
        expiresAt: new Date(Date.now() + ttlMs),
        acceptedAt: null,
        revokedAt: null,
      }),
    );
    const org = await this.organizations.getCurrent();
    const acceptUrl = new URL('/invitations/accept', this.config.get('PUBLIC_APP_URL'));
    acceptUrl.searchParams.set('token', token);
    const payload: InvitationCreatedPayload = {
      invitationId: invitation.id,
      organizationId: org.id,
      organizationName: org.name,
      email,
      role: dto.role,
      acceptUrl: acceptUrl.toString(),
      expiresAt: invitation.expiresAt.toISOString(),
    };
    await this.outbox.enqueue(DomainEvents.InvitationCreated, payload);
    await this.audit.record(actor, {
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: invitation.id,
      after: { email, role: dto.role, expiresAt: invitation.expiresAt },
    });
    const { tokenHash: _secret, ...view } = invitation;
    return view;
  }

  list(): Promise<Invitation[]> {
    return this.tenancy.repository(Invitation).find({
      where: { acceptedAt: IsNull(), revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(actor: AuditActor, id: string): Promise<void> {
    const repo = this.tenancy.repository(Invitation);
    const invitation = await repo.findOne({
      where: { id, acceptedAt: IsNull(), revokedAt: IsNull() },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    invitation.revokedAt = new Date();
    await repo.save(invitation);
    await this.audit.record(actor, {
      action: 'invitation.revoked',
      entityType: 'invitation',
      entityId: id,
      before: { revokedAt: null },
      after: { revokedAt: invitation.revokedAt },
    });
  }

  /** Pre-tenant lookup through the SECURITY DEFINER function (RLS hides invitations otherwise). */
  async findPendingByToken(rawToken: string): Promise<PendingInvitation> {
    const rows: InvitationLookupRow[] = await this.dataSource.query(
      'SELECT * FROM app_find_invitation($1)',
      [sha256(rawToken)],
    );
    const row = rows[0];
    if (!row || row.revoked_at) throw new NotFoundException('Invitation not found');
    if (row.accepted_at) throw new ConflictException('Invitation already accepted');
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new GoneException('Invitation expired');
    }
    return { id: row.id, organizationId: row.organization_id, email: row.email, role: row.role };
  }

  /** Must run inside tenancy.run() for the invitation's organization. */
  async accept(invitation: PendingInvitation, userId: string): Promise<void> {
    const manager = this.tenancy.manager();
    const claimed = await manager
      .createQueryBuilder()
      .update(Invitation)
      .set({ acceptedAt: () => 'now()' })
      .where({ id: invitation.id, acceptedAt: IsNull(), revokedAt: IsNull() })
      .execute();
    if (claimed.affected !== 1) throw new ConflictException('Invitation already used');
    const existing = await manager.findOne(Membership, {
      where: { organizationId: invitation.organizationId, userId },
    });
    if (existing) throw new ConflictException('Already a member of this organization');
    const membership = await manager.save(
      manager.create(Membership, {
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
      }),
    );
    await this.audit.record(
      { actorType: 'user', actorId: userId },
      {
        action: 'invitation.accepted',
        entityType: 'membership',
        entityId: membership.id,
        after: { userId, role: invitation.role, invitationId: invitation.id },
      },
    );
  }
}
