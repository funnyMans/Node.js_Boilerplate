export const userStatuses = ['active', 'blocked', 'deleted'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const authRoles = [
  'transportation_executive',
  'chief_supervisor',
  'area_supervisor',
  'broker',
  'outer_fleet_broker',
  'fleet_dispatcher',
  'contract_capacity_dispatcher',
  'in_house_driver',
  'contracted_driver',
  'customer_contact',
  'outside_carrier_contact',
  'outer_fleet_supervisor',
] as const;
export type AuthRole = (typeof authRoles)[number];

export const companyAreas = ['la', 'west', 'central', 'east'] as const;
export type CompanyArea = (typeof companyAreas)[number];

export type AuthRoleGrant = {
  role: AuthRole;
  area?: CompanyArea;
};

export type UserDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  status: UserStatus;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserDto = {
  email: string;
  status?: UserStatus;
};

export type UpdateUserDto = Partial<{
  firstName: string;
  lastName: string;
  isActive: boolean;
  status: UserStatus;
}>;

export type AppErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type AppResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AppErrorShape;
    };

export type UserListResponse = {
  users: UserDto[];
};

export type UserCountResponse = {
  count: number;
};

export type UserNotFoundError = AppErrorShape & {
  code: 'USER_NOT_FOUND';
};

export type ValidationError = AppErrorShape & {
  code: 'VALIDATION_ERROR';
};

export type ForbiddenError = AppErrorShape & {
  code: 'FORBIDDEN';
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  roleGrants: AuthRoleGrant[];
  expiresAt: string;
  refreshExpiresAt: string;
};

export type AuthSessionResponse = {
  valid: true;
  userId: string;
  roleGrants: AuthRoleGrant[];
  expiresAt: string;
};

export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'INVALID_SESSION' | 'AUTH_SERVICE_UNAVAILABLE';

export type AuthErrorShape = AppErrorShape & {
  code: AuthErrorCode;
};
