import type { AuthSessionResponse } from '@app/contracts';

export type AuthenticatedSession = AuthSessionResponse;

export interface AuthClientPort {
  validateSession(
    token: string,
    requestContext?: Record<string, string>
  ): Promise<AuthenticatedSession | null>;
}
