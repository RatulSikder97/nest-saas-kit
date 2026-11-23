import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-principal.decorator';
import { MinRole, UserOnly } from '../../common/decorators/roles.decorator';
import { type UserPrincipal } from '../../common/types/principal';
import { CreateInvitationDto } from './dto/invitation.dto';
import { type Invitation } from './invitation.entity';
import { type InvitationView, InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiBearerAuth()
@MinRole('admin')
@UserOnly()
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Invite someone by email. Sends the invitation email asynchronously via the outbox. */
  @Post()
  create(
    @CurrentUser() user: UserPrincipal,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    return this.invitations.create({ actorType: 'user', actorId: user.userId }, dto);
  }

  /** Pending invitations. */
  @Get()
  list(): Promise<Invitation[]> {
    return this.invitations.list();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.invitations.revoke({ actorType: 'user', actorId: user.userId }, id);
  }
}
