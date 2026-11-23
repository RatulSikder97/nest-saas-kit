import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type UserPrincipal } from '../../common/types/principal';
import { TenancyService } from '../../tenancy/tenancy.service';
import { AuditService } from '../audit/audit.service';
import { InvitationsService } from '../invitations/invitations.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { normalizeEmail, UsersService } from '../users/users.service';
import { type LoginDto, type SignupDto } from './dto/auth.dto';
import { PasswordService } from './password.service';
import { type AuthTokens, TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly organizations: OrganizationsService,
    private readonly invitations: InvitationsService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokens> {
    const email = normalizeEmail(dto.email);
    if (await this.users.findByEmailWithPassword(email)) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    const userId = randomUUID();

    if (dto.invitationToken) {
      const invitation = await this.invitations.findPendingByToken(dto.invitationToken);
      if (invitation.email !== email) {
        throw new ForbiddenException('Invitation was issued to a different email address');
      }
      const role = await this.tenancy.run(
        { organizationId: invitation.organizationId, userId },
        async (manager) => {
          await this.users.create(manager, { id: userId, email, name: dto.name, passwordHash });
          await this.invitations.accept(invitation, userId);
          return invitation.role;
        },
      );
      const membership = await this.organizations.findMembership(userId, invitation.organizationId);
      return this.tokens.issueSession({
        userId,
        organizationId: invitation.organizationId,
        role,
        plan: membership?.organization.plan ?? 'free',
      });
    }

    const organizationId = randomUUID();
    const org = await this.tenancy.run({ organizationId, userId }, async (manager) => {
      await this.users.create(manager, { id: userId, email, name: dto.name, passwordHash });
      const created = await this.organizations.createWithOwner(manager, {
        id: organizationId,
        name: dto.organizationName ?? `${dto.name}'s organization`,
        ownerUserId: userId,
      });
      await this.audit.record(
        { actorType: 'user', actorId: userId },
        {
          action: 'organization.created',
          entityType: 'organization',
          entityId: created.id,
          after: created,
        },
      );
      return created;
    });
    return this.tokens.issueSession({
      userId,
      organizationId: org.id,
      role: 'owner',
      plan: org.plan,
    });
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const valid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    const memberships = await this.organizations.listForUser(user.id);
    const target = dto.organizationId
      ? memberships.find((m) => m.organizationId === dto.organizationId)
      : memberships[0];
    if (!target) throw new ForbiddenException('No membership in the requested organization');
    return this.tokens.issueSession({
      userId: user.id,
      organizationId: target.organizationId,
      role: target.role,
      plan: target.plan,
    });
  }

  /**
   * Rotates the refresh token. Role and plan are re-read from the database so that membership
   * changes take effect at the next refresh; removed members cannot refresh at all.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const result = await this.tokens.rotate(rawRefreshToken);
    if (result.status === 'reused') {
      throw new UnauthorizedException('Refresh token reuse detected; session revoked');
    }
    if (result.status === 'invalid') throw new UnauthorizedException('Invalid refresh token');

    const { token, secret } = result;
    const membership = await this.organizations.findMembership(token.userId, token.organizationId);
    if (!membership) {
      await this.tokens.revokeFamily(token.familyId);
      throw new UnauthorizedException('Membership no longer exists');
    }
    return this.tokens.buildTokens(
      {
        userId: token.userId,
        organizationId: token.organizationId,
        role: membership.role,
        plan: membership.organization.plan,
      },
      token,
      secret,
    );
  }

  /** Revokes the whole session (token family) the refresh token belongs to. Idempotent. */
  async logout(rawRefreshToken: string): Promise<void> {
    const token = await this.tokens.findFamily(rawRefreshToken);
    if (token) await this.tokens.revokeFamily(token.familyId);
  }

  async switchOrganization(principal: UserPrincipal, organizationId: string): Promise<AuthTokens> {
    const membership = await this.organizations.findMembership(principal.userId, organizationId);
    if (!membership) throw new ForbiddenException('No membership in the requested organization');
    return this.tokens.issueSession({
      userId: principal.userId,
      organizationId,
      role: membership.role,
      plan: membership.organization.plan,
    });
  }

  async acceptInvitation(principal: UserPrincipal, rawToken: string): Promise<AuthTokens> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new UnauthorizedException();
    const invitation = await this.invitations.findPendingByToken(rawToken);
    if (invitation.email !== user.email) {
      throw new ForbiddenException('Invitation was issued to a different email address');
    }
    await this.tenancy.run({ organizationId: invitation.organizationId, userId: user.id }, () =>
      this.invitations.accept(invitation, user.id),
    );
    return this.switchOrganization(principal, invitation.organizationId);
  }
}
