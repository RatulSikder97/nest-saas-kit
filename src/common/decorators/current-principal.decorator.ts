import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { type AuthenticatedRequest, type Principal, type UserPrincipal } from '../types/principal';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.principal) throw new UnauthorizedException();
    return req.principal;
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserPrincipal => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.principal?.type !== 'user') throw new UnauthorizedException();
    return req.principal;
  },
);
