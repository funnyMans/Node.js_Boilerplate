import type { Credential } from '../models/credential.entity';
import type { Session } from '../models/session.entity';
import type { AuthRole } from '@app/contracts';

export type CreateCredentialPayload = {
  userId: string;
  email: string;
  passwordHash: string;
  role?: AuthRole;
};

export type CreateSessionPayload = {
  credentialId: string;
  userId: string;
  role: AuthRole;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

export type ActiveSession = {
  id: string;
  userId: string;
  role: AuthRole;
  credentialId: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

export interface AuthRepositoryPort {
  findCredentialByEmail(email: string): Promise<Credential | null>;
  createCredential(input: CreateCredentialPayload): Promise<Credential>;
  createSession(input: CreateSessionPayload): Promise<Session>;
  findActiveSession(token: string): Promise<ActiveSession | null>;
  findActiveSessionByRefreshToken(refreshToken: string): Promise<ActiveSession | null>;
  revokeSession(token: string): Promise<void>;
  revokeSessionByRefreshToken(refreshToken: string): Promise<void>;
}
