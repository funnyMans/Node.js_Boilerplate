import type { User } from '../../../domain/models/user.entity';
import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';
import type { UpdateUserInput } from './update-user.dto';

export class UpdateUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(id: string, input: UpdateUserInput): Promise<User> {
    const current = await this.userRepository.getById(id);

    if (!current) {
      throw new Error('User not found');
    }

    const next: UpdateUserInput = { ...input };

    if (input.status === 'active') {
      next.isActive = true;
      next.deletedAt = null;
    }

    if (input.status === 'blocked') {
      next.isActive = false;
    }

    if (input.status === 'deleted') {
      next.isActive = false;
      next.deletedAt = new Date();
    }

    return this.userRepository.update(id, next);
  }
}
