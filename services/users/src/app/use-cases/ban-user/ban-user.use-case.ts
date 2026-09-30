import type { User } from '../../../domain/models/user.entity';
import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';
import type { BanUserInput } from './ban-user.dto';

export class BanUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(id: string, _input: BanUserInput): Promise<User> {
    const current = await this.userRepository.getById(id);

    if (!current) {
      throw new Error('User not found');
    }

    const updated = current.markBlocked();
    return this.userRepository.update(id, {
      isActive: updated.isActive,
      status: updated.status,
      deletedAt: updated.deletedAt,
    });
  }
}
