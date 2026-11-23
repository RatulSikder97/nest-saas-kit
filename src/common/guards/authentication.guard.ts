import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';
import { TokenService } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { type AuthenticatedRequest } from '../types/principal';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Global authentication. Accepts either `Authorization: Bearer <access JWT>` or
 * `X-API-Key: nsk_...`, and attaches the resolved Principal (which carries the tenant) to the
 * request. Routes opt out with @Public().
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = req.headers.authorization;
    const apiKey = req.headers[API_KEY_HEADER];

    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      req.principal = await this.tokens.verifyAccessToken(authorization.slice(7).trim());
      return true;
    }
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const principal = await this.apiKeys.authenticate(apiKey);
      if (!principal) throw new UnauthorizedException('Invalid API key');
      req.principal = principal;
      return true;
    }
    throw new UnauthorizedException('Missing credentials');
  }
}
