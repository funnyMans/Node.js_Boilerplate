import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AuthRoleGrant } from '@app/contracts';
import type {
  JwtTokenService,
  VerifiedToken,
} from '../../app/services/jwt-token-service.interface';

export class JoseJwtTokenService implements JwtTokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;

  constructor(accessSecret: string, refreshSecret: string) {
    this.accessKey = new TextEncoder().encode(accessSecret);
    this.refreshKey = new TextEncoder().encode(refreshSecret);
  }

  issueAccessToken(input: {
    userId: string;
    roleGrants: AuthRoleGrant[];
    expiresAt: Date;
  }): Promise<string> {
    return new SignJWT({ roleGrants: input.roleGrants, tokenUse: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
      .sign(this.accessKey);
  }

  issueRefreshToken(input: { userId: string; expiresAt: Date }): Promise<string> {
    return new SignJWT({ tokenUse: 'refresh' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
      .sign(this.refreshKey);
  }

  async verifyAccessToken(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, { algorithms: ['HS256'] });
      if (payload.tokenUse !== 'access' || typeof payload.sub !== 'string') return null;
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.refreshKey, { algorithms: ['HS256'] });
      if (payload.tokenUse !== 'refresh' || typeof payload.sub !== 'string') return null;
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }
}
