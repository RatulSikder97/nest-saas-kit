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
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { MinRole } from '../../common/decorators/roles.decorator';
import { actorOf, type Principal } from '../../common/types/principal';
import { type Paginated, PaginationQuery } from '../../common/utils/pagination';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { type Project } from './project.entity';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query() query: PaginationQuery): Promise<Paginated<Project>> {
    return this.projects.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return this.projects.get(id);
  }

  /** Supports `Idempotency-Key` for safe retries. */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateProjectDto,
  ): Promise<Project> {
    return this.projects.create(actorOf(principal), dto);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projects.update(actorOf(principal), id, dto);
  }

  @Delete(':id')
  @MinRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.projects.remove(actorOf(principal), id);
  }
}
