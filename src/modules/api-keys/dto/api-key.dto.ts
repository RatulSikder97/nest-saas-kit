import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsIn(['admin', 'member'])
  role: 'admin' | 'member' = 'member';

  /** Optional lifetime in days (1-365). Omit for a non-expiring key. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}
