import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MinRole } from '../../common/decorators/roles.decorator';
import { type Paginated, PaginationQuery } from '../../common/utils/pagination';
import { type AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';

export class AuditQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Organization audit trail, newest first. Requires admin. */
  @Get()
  @MinRole('admin')
  list(@Query() query: AuditQuery): Promise<Paginated<AuditLog>> {
    return this.audit.list(query, { entityType: query.entityType, entityId: query.entityId });
  }
}
