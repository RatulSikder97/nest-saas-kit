import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MIN_ROLE_KEY, USER_ONLY_KEY } from '../decorators/roles.decorator';
import { type AuthenticatedRequest } from '../types/principal';
import { type Role, roleSatisfies } from '../types/roles';

/** RBAC: enforces @MinRole and @UserOnly against the authenticated principal. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const minRole = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, targets);
    const userOnly = this.reflector.getAllAndOverride<boolean | undefined>(USER_ONLY_KEY, targets);
    if (!minRole && !userOnly) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) throw new ForbiddenException();
    if (userOnly && principal.type !== 'user') {
      throw new ForbiddenException('This endpoint requires a user session');
    }
    if (minRole && !roleSatisfies(principal.role, minRole)) {
      throw new ForbiddenException(`Requires role ${minRole} or higher`);
    }
    return true;
  }
}
