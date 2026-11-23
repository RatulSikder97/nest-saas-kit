import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { type UsageSummary, UsageService, utcDay } from './usage.service';

export class UsageQuery {
  /** Inclusive start day (YYYY-MM-DD). Defaults to 30 days ago. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  /** Inclusive end day (YYYY-MM-DD). Defaults to today. */
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

@ApiTags('usage')
@ApiBearerAuth()
@ApiSecurity('api-key')
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  summary(@Query() query: UsageQuery): Promise<UsageSummary> {
    const to = query.to?.slice(0, 10) ?? utcDay();
    const from = query.from?.slice(0, 10) ?? utcDay(new Date(Date.now() - 30 * 86_400_000));
    if (from > to) throw new BadRequestException('`from` must not be after `to`');
    return this.usage.summary(from, to);
  }
}
