import type { AuthRoleGrant } from '@app/contracts';
import type { Credential } from '../models/credential.entity';
import type { Session } from '../models/session.entity';

export type CreateCredentialPayload = {
  userId: string;
  email: string;
  passwordHash: string;
  roleGrants: AuthRoleGrant[];
};

export type CreateSessionPayload = {
  credentialId: string;
  userId: string;
  roleGrants: AuthRoleGrant[];
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

export type RotateSessionPayload = CreateSessionPayload & {
  currentRefreshToken: string;
};

export type ActiveSession = {
  id: string;
  userId: string;
  roleGrants: AuthRoleGrant[];
  credentialId: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
};

export interface AuthRepositoryPort {
  findCredentialByEmail(email: string): Promise<Credential | null>;
  createCredential(input: CreateCredentialPayload): Promise<Credential>;
  replaceCredentialRoleGrants(
    credentialId: string,
    grants: AuthRoleGrant[],
    passwordHash: string
  ): Promise<Credential>;
  createSession(input: CreateSessionPayload): Promise<Session>;
  rotateSession(input: RotateSessionPayload): Promise<Session>;
  findActiveSession(token: string): Promise<ActiveSession | null>;
  findActiveSessionByRefreshToken(refreshToken: string): Promise<ActiveSession | null>;
  revokeSession(token: string): Promise<void>;
  revokeCredentialSessions(credentialId: string): Promise<void>;
}
