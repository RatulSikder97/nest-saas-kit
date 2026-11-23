import { SetMetadata } from '@nestjs/common';
import { type Role } from '../types/roles';

export const MIN_ROLE_KEY = 'auth:minRole';
export const USER_ONLY_KEY = 'auth:userOnly';

/** Requires the caller's role in the current organization to be at least `role`. */
export const MinRole = (role: Role): MethodDecorator & ClassDecorator =>
  SetMetadata(MIN_ROLE_KEY, role);

/** Rejects API-key principals; the endpoint manages a human session or human-only resource. */
export const UserOnly = (): MethodDecorator & ClassDecorator => SetMetadata(USER_ONLY_KEY, true);
