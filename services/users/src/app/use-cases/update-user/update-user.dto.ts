import type { UserStatus } from '../../../domain/models/user.entity';

export type UpdateUserInput = Partial<{
  firstName: string;
  lastName: string;
  isActive: boolean;
  status: UserStatus;
  deletedAt: Date | null;
}>;
