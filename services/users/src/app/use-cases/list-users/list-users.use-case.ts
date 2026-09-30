import type { User, UserFilters } from '../../../domain/models/user.entity';
import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';

export class ListUsersUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(filters?: UserFilters): Promise<User[]> {
    return this.userRepository.list(filters);
  }
}
