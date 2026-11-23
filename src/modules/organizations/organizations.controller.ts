import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, CurrentUser } from '../../common/decorators/current-principal.decorator';
import { MinRole, UserOnly } from '../../common/decorators/roles.decorator';
import { actorOf, type Principal, type UserPrincipal } from '../../common/types/principal';
import { type Organization } from './organization.entity';
import { ChangeRoleDto, UpdateOrganizationDto } from './organizations.dto';
import {
  type MemberView,
  type OrganizationMembershipView,
  OrganizationsService,
} from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  /** Organizations the signed-in user belongs to. */
  @Get()
  @UserOnly()
  listMine(@CurrentUser() user: UserPrincipal): Promise<OrganizationMembershipView[]> {
    return this.organizations.listForUser(user.userId);
  }

  @Get('current')
  current(): Promise<Organization> {
    return this.organizations.getCurrent();
  }

  @Patch('current')
  @MinRole('admin')
  update(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    return this.organizations.rename(actorOf(principal), dto.name);
  }

  @Get('current/members')
  members(): Promise<MemberView[]> {
    return this.organizations.listMembers();
  }

  /** Change a member's role. Owner only. */
  @Patch('current/members/:userId')
  @MinRole('owner')
  @UserOnly()
  changeRole(
    @CurrentPrincipal() principal: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<MemberView> {
    return this.organizations.changeRole(actorOf(principal), userId, dto.role);
  }

  @Delete('current/members/:userId')
  @MinRole('admin')
  @UserOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.organizations.removeMember(actorOf(principal), principal.role, userId);
  }
}
