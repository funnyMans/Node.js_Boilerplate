import type { AuthRoleGrant } from '@app/contracts';

export type ProvisionAccountInput = {
  email: string;
  password: string;
  roleGrants: AuthRoleGrant[];
};
