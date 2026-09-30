import type { User } from '../../../domain/models/user.entity';
import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';

export class GetUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(id: string): Promise<User | null> {
    return this.userRepository.getById(id);
  }
}
