import type { UserFilters, UserStatus } from '../../../domain/models/user.entity';
import { createUserSchema, updateUserProfileSchema } from '../../../domain/models/user.schema';

export type CreateUserRequest = {
  email: string;
  status?: UserStatus;
};

export type UpdateUserRequest = {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  status?: UserStatus;
  deletedAt?: Date | null;
};

export function parseCreateUserRequest(
  body: unknown
):
  | { success: true; data: CreateUserRequest }
  | { success: false; error: ReturnType<typeof createUserSchema.safeParse>['error'] } {
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  return {
    success: true,
    data: {
      email: parsed.data.email,
      status: parsed.data.status,
    },
  };
}

export function parseUpdateUserRequest(
  body: unknown
):
  | { success: true; data: UpdateUserRequest }
  | { success: false; error: ReturnType<typeof updateUserProfileSchema.safeParse>['error'] } {
  const parsed = updateUserProfileSchema.safeParse(body);

  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

export function parseListUsersQuery(query: unknown): UserFilters {
  const { email, isActive, status } = (query ?? {}) as {
    email?: string;
    isActive?: string | boolean;
    status?: string;
  };

  const filters: UserFilters = {};

  if (typeof email === 'string' && email.trim().length > 0) {
    filters.email = email.trim();
  }

  if (typeof isActive === 'string') {
    const normalized = isActive.toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      filters.isActive = normalized === 'true';
    }
  } else if (typeof isActive === 'boolean') {
    filters.isActive = isActive;
  }

  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (normalized === 'active' || normalized === 'blocked' || normalized === 'deleted') {
      filters.status = normalized as UserStatus;
    }
  }

  return filters;
}
