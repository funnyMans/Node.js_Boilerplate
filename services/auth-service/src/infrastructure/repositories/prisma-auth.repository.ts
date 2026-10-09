import { createHmac } from 'node:crypto';
import type { AuthRoleGrant } from '@app/contracts';
import type { PrismaClient } from '../../../generated/prisma/client';
import { Credential } from '../../domain/models/credential.entity';
import { Session } from '../../domain/models/session.entity';
import type {
  ActiveSession,
  AuthRepositoryPort,
  CreateCredentialPayload,
  CreateSessionPayload,
  RotateSessionPayload,
} from '../../domain/repositories/auth.repository.interface';
import { config } from '../config';

const credentialInclude = { roleGrants: { select: { role: true, area: true } } } as const;
const sessionCredentialSelect = {
  select: {
    userId: true,
    roleGrants: { select: { role: true, area: true } },
  },
} as const;

export class PrismaAuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialByEmail(email: string): Promise<Credential | null> {
    const credential = await this.prisma.credential.findUnique({
      where: { email },
      include: credentialInclude,
    });
    return credential ? mapCredential(credential) : null;
  }

  async createCredential(input: CreateCredentialPayload): Promise<Credential> {
    const credential = await this.prisma.credential.create({
      data: {
        userId: input.userId,
        email: input.email,
        passwordHash: input.passwordHash,
        roleGrants: {
          create: input.roleGrants.map(({ role, area }) => ({
            role,
            area: area ?? 'company',
          })),
        },
      },
      include: credentialInclude,
    });
    return mapCredential(credential);
  }

  async replaceCredentialRoleGrants(
    credentialId: string,
    grants: AuthRoleGrant[],
    passwordHash: string
  ): Promise<Credential> {
    const credential = await this.prisma.$transaction(async (transaction) => {
      await transaction.credentialRoleGrant.deleteMany({ where: { credentialId } });
      await transaction.credential.update({ where: { id: credentialId }, data: { passwordHash } });
      if (grants.length > 0) {
        await transaction.credentialRoleGrant.createMany({
          data: grants.map(({ role, area }) => ({
            credentialId,
            role,
            area: area ?? 'company',
          })),
        });
      }
      await transaction.session.updateMany({
        where: { credentialId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return transaction.credential.findUniqueOrThrow({
        where: { id: credentialId },
        include: credentialInclude,
      });
    });
    return mapCredential(credential);
  }

  async createSession(input: CreateSessionPayload): Promise<Session> {
    const session = await this.prisma.session.create({
      data: {
        credentialId: input.credentialId,
        tokenHash: this.hashToken(input.token),
        refreshTokenHash: this.hashToken(input.refreshToken),
        expiresAt: input.expiresAt,
        refreshExpiresAt: input.refreshExpiresAt,
      },
    });
    return mapSession(session.id, session.expiresAt, session.refreshExpiresAt, input);
  }

  async rotateSession(input: RotateSessionPayload): Promise<Session> {
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.session.updateMany({
        where: {
          refreshTokenHash: this.hashToken(input.currentRefreshToken),
          revokedAt: null,
          refreshExpiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new Error('Invalid refresh token');

      const session = await transaction.session.create({
        data: {
          credentialId: input.credentialId,
          tokenHash: this.hashToken(input.token),
          refreshTokenHash: this.hashToken(input.refreshToken),
          expiresAt: input.expiresAt,
          refreshExpiresAt: input.refreshExpiresAt,
        },
      });
      return mapSession(session.id, session.expiresAt, session.refreshExpiresAt, input);
    });
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeCredentialSessions(credentialId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { credentialId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async findActiveSession(token: string): Promise<ActiveSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: this.hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        expiresAt: true,
        refreshExpiresAt: true,
        credentialId: true,
        credential: sessionCredentialSelect,
      },
    });
    return session
      ? mapActiveSession(
          session.id,
          session.credentialId,
          session.expiresAt,
          session.refreshExpiresAt,
          session.credential
        )
      : null;
  }

  async findActiveSessionByRefreshToken(refreshToken: string): Promise<ActiveSession | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: this.hashToken(refreshToken),
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        credentialId: true,
        expiresAt: true,
        refreshExpiresAt: true,
        credential: sessionCredentialSelect,
      },
    });
    return session
      ? mapActiveSession(
          session.id,
          session.credentialId,
          session.expiresAt,
          session.refreshExpiresAt,
          session.credential
        )
      : null;
  }

  private hashToken(token: string): string {
    return createHmac('sha256', config.AUTH_TOKEN_HASH_SECRET).update(token).digest('hex');
  }
}

function mapRoleGrants(
  grants: Array<{
    role: AuthRoleGrant['role'];
    area: 'company' | NonNullable<AuthRoleGrant['area']>;
  }>
): AuthRoleGrant[] {
  return grants.map(({ role, area }) => (area === 'company' ? { role } : { role, area }));
}

function mapCredential(credential: {
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  roleGrants: Array<{
    role: AuthRoleGrant['role'];
    area: 'company' | NonNullable<AuthRoleGrant['area']>;
  }>;
}): Credential {
  return new Credential(
    credential.id,
    credential.userId,
    credential.email,
    credential.passwordHash,
    mapRoleGrants(credential.roleGrants)
  );
}

function mapSession(
  id: string,
  expiresAt: Date,
  refreshExpiresAt: Date,
  input: CreateSessionPayload
): Session {
  return new Session(
    id,
    input.token,
    input.refreshToken,
    input.userId,
    input.roleGrants,
    expiresAt,
    refreshExpiresAt
  );
}

function mapActiveSession(
  id: string,
  credentialId: string,
  expiresAt: Date,
  refreshExpiresAt: Date,
  credential: {
    userId: string;
    roleGrants: Array<{
      role: AuthRoleGrant['role'];
      area: 'company' | NonNullable<AuthRoleGrant['area']>;
    }>;
  }
): ActiveSession {
  return {
    id,
    userId: credential.userId,
    roleGrants: mapRoleGrants(credential.roleGrants),
    credentialId,
    expiresAt,
    refreshExpiresAt,
  };
}
