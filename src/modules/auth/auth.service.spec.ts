import { UnauthorizedException } from '@nestjs/common';
import { type TenancyService } from '../../tenancy/tenancy.service';
import { type AuditService } from '../audit/audit.service';
import { type InvitationsService } from '../invitations/invitations.service';
import { type OrganizationsService } from '../organizations/organizations.service';
import { type UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { type PasswordService } from './password.service';
import { type TokenService } from './token.service';

describe('AuthService', () => {
  let users: { findByEmailWithPassword: jest.Mock };
  let passwords: { verify: jest.Mock; verifyAgainstDummy: jest.Mock };
  let tokens: {
    rotate: jest.Mock;
    revokeFamily: jest.Mock;
    buildTokens: jest.Mock;
    issueSession: jest.Mock;
  };
  let organizations: { findMembership: jest.Mock; listForUser: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = { findByEmailWithPassword: jest.fn() };
    passwords = { verify: jest.fn(), verifyAgainstDummy: jest.fn().mockResolvedValue(false) };
    tokens = {
      rotate: jest.fn(),
      revokeFamily: jest.fn(),
      buildTokens: jest.fn(),
      issueSession: jest.fn(),
    };
    organizations = { findMembership: jest.fn(), listForUser: jest.fn() };
    service = new AuthService(
      users as unknown as UsersService,
      organizations as unknown as OrganizationsService,
      {} as InvitationsService,
      passwords as unknown as PasswordService,
      tokens as unknown as TokenService,
      {} as TenancyService,
      {} as AuditService,
    );
  });

  describe('login', () => {
    it('runs a dummy hash verification for unknown emails (no user enumeration by timing)', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);
      await expect(service.login({ email: 'x@example.com', password: 'p' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(passwords.verifyAgainstDummy).toHaveBeenCalledWith('p');
    });

    it('issues a session for the requested organization only if the user is a member', async () => {
      users.findByEmailWithPassword.mockResolvedValue({ id: 'u1', passwordHash: 'h' });
      passwords.verify.mockResolvedValue(true);
      organizations.listForUser.mockResolvedValue([
        { organizationId: 'o1', role: 'owner', plan: 'free' },
        { organizationId: 'o2', role: 'member', plan: 'pro' },
      ]);
      await service.login({ email: 'a@example.com', password: 'p', organizationId: 'o2' });
      expect(tokens.issueSession).toHaveBeenCalledWith({
        userId: 'u1',
        organizationId: 'o2',
        role: 'member',
        plan: 'pro',
      });
      await expect(
        service.login({ email: 'a@example.com', password: 'p', organizationId: 'o3' }),
      ).rejects.toThrow('No membership');
    });
  });

  describe('refresh', () => {
    it('rejects reused tokens', async () => {
      tokens.rotate.mockResolvedValue({ status: 'reused', familyId: 'f' });
      await expect(service.refresh('t')).rejects.toThrow('reuse detected');
    });

    it('revokes the family when the membership no longer exists', async () => {
      tokens.rotate.mockResolvedValue({
        status: 'rotated',
        token: { userId: 'u1', organizationId: 'o1', familyId: 'f1' },
        secret: 's',
      });
      organizations.findMembership.mockResolvedValue(null);
      await expect(service.refresh('t')).rejects.toThrow('Membership no longer exists');
      expect(tokens.revokeFamily).toHaveBeenCalledWith('f1');
    });

    it('re-reads role and plan from the database on refresh', async () => {
      const token = { userId: 'u1', organizationId: 'o1', familyId: 'f1' };
      tokens.rotate.mockResolvedValue({ status: 'rotated', token, secret: 's' });
      organizations.findMembership.mockResolvedValue({
        role: 'admin',
        organization: { plan: 'enterprise' },
      });
      await service.refresh('t');
      expect(tokens.buildTokens).toHaveBeenCalledWith(
        { userId: 'u1', organizationId: 'o1', role: 'admin', plan: 'enterprise' },
        token,
        's',
      );
    });
  });
});
