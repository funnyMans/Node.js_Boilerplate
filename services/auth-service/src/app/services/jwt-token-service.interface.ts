import type { AuthRoleGrant } from '@app/contracts';

export type VerifiedToken = {
  userId: string;
};

export interface JwtTokenService {
  issueAccessToken(input: {
    userId: string;
    roleGrants: AuthRoleGrant[];
    expiresAt: Date;
  }): Promise<string>;
  issueRefreshToken(input: { userId: string; expiresAt: Date }): Promise<string>;
  verifyAccessToken(token: string): Promise<VerifiedToken | null>;
  verifyRefreshToken(token: string): Promise<VerifiedToken | null>;
}
