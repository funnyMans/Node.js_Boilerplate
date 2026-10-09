import type { AuthRoleGrant } from '@app/contracts';

export class Credential {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly roleGrants: AuthRoleGrant[]
  ) {}
}
