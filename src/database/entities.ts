import { ApiKey } from '../modules/api-keys/api-key.entity';
import { AuditLog } from '../modules/audit/audit-log.entity';
import { RefreshToken } from '../modules/auth/refresh-token.entity';
import { Invitation } from '../modules/invitations/invitation.entity';
import { Membership } from '../modules/organizations/membership.entity';
import { Organization } from '../modules/organizations/organization.entity';
import { OutboxEvent } from '../modules/outbox/outbox-event.entity';
import { Project } from '../modules/projects/project.entity';
import { UsageRecord } from '../modules/usage/usage-record.entity';
import { User } from '../modules/users/user.entity';

export const entities = [
  User,
  Organization,
  Membership,
  RefreshToken,
  Invitation,
  ApiKey,
  Project,
  AuditLog,
  UsageRecord,
  OutboxEvent,
];
