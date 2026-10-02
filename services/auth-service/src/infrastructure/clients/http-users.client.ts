import type {
  CreateUserInput,
  CreatedUser,
  UsersClientPort,
} from '../../app/services/users-client.interface';
import { UsersServiceUnavailableError } from '../../app/services/users-client.interface';

export class HttpUsersClient implements UsersClientPort {
  constructor(private readonly usersServiceUrl: string) {}

  async createUser(input: CreateUserInput): Promise<CreatedUser> {
    try {
      const response = await fetch(`${this.usersServiceUrl}/users`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) throw new UsersServiceUnavailableError();

      const user = (await response.json()) as Partial<CreatedUser>;
      if (!user.id || !user.email) throw new UsersServiceUnavailableError();

      return { id: user.id, email: user.email };
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) throw error;
      throw new UsersServiceUnavailableError();
    }
  }

  async isUserActive(userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.usersServiceUrl}/users/${encodeURIComponent(userId)}`);
      if (response.status === 404) return false;
      if (!response.ok) throw new UsersServiceUnavailableError();

      const user = (await response.json()) as { isActive?: unknown; status?: unknown };
      if (typeof user.isActive !== 'boolean') throw new UsersServiceUnavailableError();
      if (user.status !== 'active' && user.status !== 'blocked' && user.status !== 'deleted') {
        throw new UsersServiceUnavailableError();
      }

      return user.isActive && user.status === 'active';
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) throw error;
      throw new UsersServiceUnavailableError();
    }
  }
}
