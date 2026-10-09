import { userStatuses } from '@app/contracts';
import type {
  CreateUserInput,
  CreatedUser,
  UsersClientPort,
} from '../../app/services/users-client.interface';
import { UsersServiceUnavailableError } from '../../app/services/users-client.interface';

const DEFAULT_USERS_REQUEST_TIMEOUT_MS = 5_000;

export class HttpUsersClient implements UsersClientPort {
  constructor(
    private readonly usersServiceUrl: string,
    private readonly requestTimeoutMs = DEFAULT_USERS_REQUEST_TIMEOUT_MS
  ) {}

  async createUser(input: CreateUserInput): Promise<CreatedUser> {
    try {
      const response = await fetch(`${this.usersServiceUrl}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!response.ok) throw new UsersServiceUnavailableError();

      const user: unknown = await response.json();
      if (!isCreatedUser(user)) throw new UsersServiceUnavailableError();

      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) throw error;
      throw new UsersServiceUnavailableError();
    }
  }

  async isUserActive(userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.usersServiceUrl}/users/${encodeURIComponent(userId)}`, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (response.status === 404) return false;
      if (!response.ok) throw new UsersServiceUnavailableError();

      const user: unknown = await response.json();
      if (!isUserLifecycle(user)) throw new UsersServiceUnavailableError();

      return user.isActive && user.status === 'active';
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) throw error;
      throw new UsersServiceUnavailableError();
    }
  }
}

function isCreatedUser(value: unknown): value is CreatedUser {
  if (typeof value !== 'object' || value === null) return false;

  return (
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    'email' in value &&
    typeof value.email === 'string' &&
    value.email.trim().length > 0
  );
}

function isUserLifecycle(
  value: unknown
): value is { isActive: boolean; status: (typeof userStatuses)[number] } {
  if (typeof value !== 'object' || value === null) return false;

  return (
    'isActive' in value &&
    typeof value.isActive === 'boolean' &&
    'status' in value &&
    typeof value.status === 'string' &&
    userStatuses.some((status) => status === value.status)
  );
}
