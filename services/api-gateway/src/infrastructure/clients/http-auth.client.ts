import type {
  AuthClientPort,
  AuthenticatedSession,
} from '../../app/services/auth-client.interface';

export class AuthServiceUnavailableError extends Error {
  constructor() {
    super('Auth service unavailable');
    this.name = 'AuthServiceUnavailableError';
  }
}

export class HttpAuthClient implements AuthClientPort {
  constructor(private readonly authServiceUrl: string) {}

  async validateSession(
    token: string,
    requestContext: Record<string, string> = {}
  ): Promise<AuthenticatedSession | null> {
    try {
      const response = await fetch(`${this.authServiceUrl}/auth/session`, {
        headers: { authorization: `Bearer ${token}`, ...requestContext },
      });

      if (response.status === 401) return null;
      if (!response.ok) throw new AuthServiceUnavailableError();

      const payload = (await response.json()) as Partial<AuthenticatedSession> & {
        valid?: boolean;
      };
      if (!payload.valid || !payload.userId || !payload.role || !payload.expiresAt) {
        throw new AuthServiceUnavailableError();
      }

      return {
        valid: true,
        userId: payload.userId,
        role: payload.role,
        expiresAt: payload.expiresAt,
      };
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) throw error;
      throw new AuthServiceUnavailableError();
    }
  }
}
