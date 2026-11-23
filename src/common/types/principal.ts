import { type Request } from 'express';
import { type Plan, type Role } from './roles';

interface BasePrincipal {
  organizationId: string;
  role: Role;
  plan: Plan;
}

export interface UserPrincipal extends BasePrincipal {
  type: 'user';
  userId: string;
  /** Refresh-token family id, i.e. the login session this access token belongs to. */
  sessionId: string;
}

export interface ApiKeyPrincipal extends BasePrincipal {
  type: 'api_key';
  apiKeyId: string;
}

export type Principal = UserPrincipal | ApiKeyPrincipal;

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

export function actorOf(principal: Principal): { actorType: Principal['type']; actorId: string } {
  return principal.type === 'user'
    ? { actorType: 'user', actorId: principal.userId }
    : { actorType: 'api_key', actorId: principal.apiKeyId };
}
