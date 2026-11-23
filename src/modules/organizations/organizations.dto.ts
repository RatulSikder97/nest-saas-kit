import { IsIn, IsString, Length } from 'class-validator';
import { ROLES, type Role } from '../../common/types/roles';

export class UpdateOrganizationDto {
  @IsString()
  @Length(2, 100)
  name!: string;
}

export class ChangeRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
