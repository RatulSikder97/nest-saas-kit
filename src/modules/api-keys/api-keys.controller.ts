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
import { type ApiKey } from './api-key.entity';
import { ApiKeysService, type CreatedApiKey } from './api-keys.service';
import { CreateApiKeyDto } from './dto/api-key.dto';

/** API keys are managed by humans only: a leaked key must not be able to mint more keys. */
@ApiTags('api-keys')
@ApiBearerAuth()
@MinRole('admin')
@UserOnly()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  /** Create a key. The `secret` in the response is shown only once. */
  @Post()
  create(@CurrentUser() user: UserPrincipal, @Body() dto: CreateApiKeyDto): Promise<CreatedApiKey> {
    return this.apiKeys.create({ actorType: 'user', actorId: user.userId }, user.role, dto);
  }

  @Get()
  list(): Promise<ApiKey[]> {
    return this.apiKeys.list();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: UserPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.apiKeys.revoke({ actorType: 'user', actorId: user.userId }, id);
  }
}
