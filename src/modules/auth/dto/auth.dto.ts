import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SignupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** At least 12 characters. */
  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  /** Name of the organization to create. Required unless `invitationToken` is given. */
  @ValidateIf((o: SignupDto) => !o.invitationToken)
  @IsString()
  @Length(2, 100)
  organizationName?: string;

  /** Join an existing organization through an invitation instead of creating one. */
  @IsOptional()
  @IsString()
  @Length(20, 200)
  invitationToken?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  /** Organization to sign into. Defaults to the oldest membership. */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refreshToken!: string;
}

export class SwitchOrganizationDto {
  @IsUUID()
  organizationId!: string;
}
