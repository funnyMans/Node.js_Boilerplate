import type { User, UserFilters, UserStatus } from '../models/user.entity';

export type CreateUserPayload = {
  email: string;
  status?: UserStatus;
};

export type UpdateUserPayload = Partial<{
  firstName: string;
  lastName: string;
  isActive: boolean;
  status: UserStatus;
  deletedAt: Date | null;
}>;

export interface UserRepositoryPort {
  create(input: CreateUserPayload): Promise<User>;
  list(filters?: UserFilters): Promise<User[]>;
  getById(id: string): Promise<User | null>;
  update(id: string, input: UpdateUserPayload): Promise<User>;
  count(): Promise<number>;
}
