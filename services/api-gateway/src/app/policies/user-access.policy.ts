import type { AuthRole } from '@app/contracts';

export type UserPermission =
  | 'users:list'
  | 'users:read:any'
  | 'users:read:own'
  | 'users:update:own'
  | 'users:update:any'
  | 'users:ban';

export type UserAccessPolicy = {
  hasPermission: (role: AuthRole, permission: UserPermission) => boolean;
  canAccessUser: (sessionUserId: string, targetUserId: string, role: AuthRole) => boolean;
  canListUsers: (role: AuthRole) => boolean;
  canBanUser: (role: AuthRole) => boolean;
};

const rolePermissions: Record<AuthRole, UserPermission[]> = {
  user: ['users:read:own', 'users:update:own'],
  admin: [
    'users:list',
    'users:read:any',
    'users:read:own',
    'users:update:own',
    'users:update:any',
    'users:ban',
  ],
};

export const userAccessPolicy: UserAccessPolicy = {
  hasPermission(role: AuthRole, permission: UserPermission): boolean {
    return rolePermissions[role]?.includes(permission) ?? false;
  },
  canAccessUser(sessionUserId: string, targetUserId: string, role: AuthRole): boolean {
    if (userAccessPolicy.hasPermission(role, 'users:read:any')) return true;
    if (userAccessPolicy.hasPermission(role, 'users:read:own')) {
      return sessionUserId === targetUserId;
    }
    return false;
  },
  canListUsers(role: AuthRole): boolean {
    return userAccessPolicy.hasPermission(role, 'users:list');
  },
  canBanUser(role: AuthRole): boolean {
    return userAccessPolicy.hasPermission(role, 'users:ban');
  },
};

export function hasUserPermission(role: AuthRole, permission: UserPermission): boolean {
  return userAccessPolicy.hasPermission(role, permission);
}

export function canAccessUser(
  sessionUserId: string,
  targetUserId: string,
  role: AuthRole
): boolean {
  return userAccessPolicy.canAccessUser(sessionUserId, targetUserId, role);
}

export function canListUsers(role: AuthRole): boolean {
  return userAccessPolicy.canListUsers(role);
}

export function canBanUser(role: AuthRole): boolean {
  return userAccessPolicy.canBanUser(role);
}
