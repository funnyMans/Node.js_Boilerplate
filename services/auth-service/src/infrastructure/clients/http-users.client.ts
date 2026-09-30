import type {
  CreateUserInput,
  CreatedUser,
  UsersClientPort,
} from '../../app/services/users-client.interface';

export class UsersServiceUnavailableError extends Error {
  constructor() {
    super('Users service unavailable');
    this.name = 'UsersServiceUnavailableError';
  }
}

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
}
