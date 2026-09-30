import type { User } from '../../../domain/models/user.entity';
import type { AppErrorShape, UserCountResponse, UserDto, UserListResponse } from '@app/contracts';

export class UserMapper {
  static toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      status: user.status,
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  static toListResponse(users: User[]): UserListResponse {
    return {
      users: users.map((user) => this.toDto(user)),
    };
  }

  static toCountResponse(count: number): UserCountResponse {
    return { count };
  }

  static toNotFoundError(): AppErrorShape {
    return {
      code: 'USER_NOT_FOUND',
      message: 'user not found',
    };
  }
}
