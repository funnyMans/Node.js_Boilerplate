import { authRoles, companyAreas } from '@app/contracts';
import type { AuthRoleGrant } from '@app/contracts';
import type {
  AuthClientPort,
  AuthenticatedSession,
} from '../../app/services/auth-client.interface';

const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 5_000;

export class AuthServiceUnavailableError extends Error {
  constructor() {
    super('Auth service unavailable');
    this.name = 'AuthServiceUnavailableError';
  }
}

export class HttpAuthClient implements AuthClientPort {
  constructor(
    private readonly authServiceUrl: string,
    private readonly requestTimeoutMs = DEFAULT_AUTH_REQUEST_TIMEOUT_MS
  ) {}

  async validateSession(
    token: string,
    requestContext: Record<string, string> = {}
  ): Promise<AuthenticatedSession | null> {
    try {
      const response = await fetch(`${this.authServiceUrl}/auth/session`, {
        headers: { authorization: `Bearer ${token}`, ...requestContext },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (response.status === 401) return null;
      if (!response.ok) throw new AuthServiceUnavailableError();

      const payload: unknown = await response.json();
      if (!isAuthenticatedSession(payload)) {
        throw new AuthServiceUnavailableError();
      }

      return {
        valid: true,
        userId: payload.userId,
        roleGrants: payload.roleGrants,
        expiresAt: payload.expiresAt,
      };
    } catch (error) {
      if (error instanceof AuthServiceUnavailableError) throw error;
      throw new AuthServiceUnavailableError();
    }
  }
}

function isAuthenticatedSession(value: unknown): value is AuthenticatedSession {
  if (typeof value !== 'object' || value === null) return false;

  const session = value as Record<string, unknown>;
  return (
    session.valid === true &&
    typeof session.userId === 'string' &&
    session.userId.trim().length > 0 &&
    Array.isArray(session.roleGrants) &&
    session.roleGrants.length > 0 &&
    session.roleGrants.every(isAuthRoleGrant) &&
    typeof session.expiresAt === 'string' &&
    Number.isFinite(Date.parse(session.expiresAt))
  );
}

function isAuthRoleGrant(value: unknown): value is AuthRoleGrant {
  if (typeof value !== 'object' || value === null || !('role' in value)) return false;
  return (
    typeof value.role === 'string' &&
    authRoles.some((role) => role === value.role) &&
    (!('area' in value) ||
      value.area === undefined ||
      (typeof value.area === 'string' && companyAreas.some((area) => area === value.area)))
  );
}
