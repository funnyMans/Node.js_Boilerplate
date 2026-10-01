export type CreateUserInput = {
  email: string;
};

export type CreatedUser = {
  id: string;
  email: string;
};

export class UsersServiceUnavailableError extends Error {
  constructor() {
    super('Users service unavailable');
    this.name = 'UsersServiceUnavailableError';
  }
}

export interface UsersClientPort {
  createUser(input: CreateUserInput): Promise<CreatedUser>;
  isUserActive(userId: string): Promise<boolean>;
}
