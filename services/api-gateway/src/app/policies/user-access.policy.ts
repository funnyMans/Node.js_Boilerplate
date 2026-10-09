import type { AuthRole, AuthRoleGrant } from '@app/contracts';

export type WorkforcePermission =
  | 'workforce:list'
  | 'workforce:read:any'
  | 'workforce:read:own'
  | 'workforce:update:any'
  | 'workforce:update:own';

export type UserAccessPolicy = {
  hasPermission: (grants: AuthRoleGrant[], permission: WorkforcePermission) => boolean;
  canAccessUser: (sessionUserId: string, targetUserId: string, grants: AuthRoleGrant[]) => boolean;
  canListUsers: (grants: AuthRoleGrant[]) => boolean;
};

const companyAuthorityRoles: AuthRole[] = ['transportation_executive', 'chief_supervisor'];

function hasCompanyAuthority(grants: AuthRoleGrant[]): boolean {
  return grants.some(
    ({ role, area }) => area === undefined && companyAuthorityRoles.includes(role)
  );
}

export const userAccessPolicy: UserAccessPolicy = {
  hasPermission(grants: AuthRoleGrant[], permission: WorkforcePermission): boolean {
    if (permission === 'workforce:read:own' || permission === 'workforce:update:own') {
      return grants.length > 0;
    }
    if (permission === 'workforce:list' || permission === 'workforce:read:any') {
      return hasCompanyAuthority(grants);
    }
    return grants.some(
      ({ role, area }) => role === 'transportation_executive' && area === undefined
    );
  },
  canAccessUser(sessionUserId, targetUserId, grants): boolean {
    if (userAccessPolicy.hasPermission(grants, 'workforce:read:any')) return true;
    return (
      sessionUserId === targetUserId && userAccessPolicy.hasPermission(grants, 'workforce:read:own')
    );
  },
  canListUsers(grants): boolean {
    return userAccessPolicy.hasPermission(grants, 'workforce:list');
  },
};
