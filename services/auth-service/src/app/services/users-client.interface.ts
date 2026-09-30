export type CreateUserInput = {
  email: string;
};

export type CreatedUser = {
  id: string;
  email: string;
};

export interface UsersClientPort {
  createUser(input: CreateUserInput): Promise<CreatedUser>;
}
