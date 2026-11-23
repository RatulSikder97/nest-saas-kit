import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-principal.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserOnly } from '../../common/decorators/roles.decorator';
import { type UserPrincipal } from '../../common/types/principal';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SignupDto, SwitchOrganizationDto } from './dto/auth.dto';
import { type AuthTokens } from './token.service';

export class AcceptInvitationDto {
  @IsString()
  @Length(20, 200)
  token!: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: UserPrincipal['role'];
  plan: UserPrincipal['plan'];
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /** Create an account plus a new organization (or join one via `invitationToken`). */
  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<AuthTokens> {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  /** Exchange a refresh token for a new token pair. The presented token becomes single-use. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Revoke the session (refresh token family). */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UserOnly()
  @Post('switch-organization')
  @HttpCode(HttpStatus.OK)
  switchOrganization(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: SwitchOrganizationDto,
  ): Promise<AuthTokens> {
    return this.auth.switchOrganization(user, dto.organizationId);
  }

  /** Accept an invitation as an existing user; returns tokens scoped to the joined organization. */
  @ApiBearerAuth()
  @UserOnly()
  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: AcceptInvitationDto,
  ): Promise<AuthTokens> {
    return this.auth.acceptInvitation(user, dto.token);
  }

  @ApiBearerAuth()
  @UserOnly()
  @Get('me')
  async me(@CurrentUser() principal: UserPrincipal): Promise<MeResponse> {
    const user = await this.users.findById(principal.userId);
    return {
      id: principal.userId,
      email: user?.email ?? '',
      name: user?.name ?? '',
      organizationId: principal.organizationId,
      role: principal.role,
      plan: principal.plan,
    };
  }
}
