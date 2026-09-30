import type { AuthRole } from '@app/contracts';

export class Session {
  constructor(
    public readonly id: string,
    public readonly token: string,
    public readonly refreshToken: string,
    public readonly userId: string,
    public readonly role: AuthRole,
    public readonly expiresAt: Date,
    public readonly refreshExpiresAt: Date
  ) {}
}
