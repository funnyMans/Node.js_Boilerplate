import type { UserStatus } from '../../../domain/models/user.entity';

export type RegisterUserInput = {
  email: string;
  status?: UserStatus;
};
