import { createHmac } from 'node:crypto';
import type { PrismaClient } from '../../../generated/prisma/client';
import { Credential } from '../../domain/models/credential.entity';
import { Session } from '../../domain/models/session.entity';
import { config } from '../config';
import type {
  AuthRepositoryPort,
  ActiveSession,
  CreateCredentialPayload,
  CreateSessionPayload,
} from '../../domain/repositories/auth.repository.interface';

export class PrismaAuthRepository implements AuthRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialByEmail(email: string): Promise<Credential | null> {
    const credential = await this.prisma.credential.findUnique({ where: { email } });
    return credential
      ? new Credential(
          credential.id,
          credential.userId,
          credential.email,
          credential.passwordHash,
          credential.role
        )
      : null;
  }

  async createCredential(input: CreateCredentialPayload): Promise<Credential> {
    const credential = await this.prisma.credential.create({ data: input });
    return new Credential(
      credential.id,
      credential.userId,
      credential.email,
      credential.passwordHash,
      credential.role
    );
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
    } as any);

    return new Session(
      session.id,
      input.token,
      input.refreshToken,
      input.userId,
      input.role,
      session.expiresAt,
      (session as any).refreshExpiresAt ?? input.refreshExpiresAt
    );
  }

  async revokeSession(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSessionByRefreshToken(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.hashToken(refreshToken), revokedAt: null },
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
        credential: { select: { userId: true, role: true } },
      },
    });

    return session
      ? {
          id: session.id,
          userId: session.credential.userId,
          role: session.credential.role,
          credentialId: session.credentialId,
          expiresAt: session.expiresAt,
          refreshExpiresAt: session.refreshExpiresAt,
        }
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
        credential: { select: { userId: true, role: true } },
      },
    });

    return session
      ? {
          id: session.id,
          userId: session.credential.userId,
          role: session.credential.role,
          credentialId: session.credentialId,
          expiresAt: session.expiresAt,
          refreshExpiresAt: session.refreshExpiresAt,
        }
      : null;
  }

  private hashToken(token: string): string {
    return createHmac('sha256', config.AUTH_TOKEN_SECRET).update(token).digest('hex');
  }
}
