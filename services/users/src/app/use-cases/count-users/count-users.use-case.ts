import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';

export class CountUsersUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(): Promise<number> {
    return this.userRepository.count();
  }
}
