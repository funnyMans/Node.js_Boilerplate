import type { User } from '../../../domain/models/user.entity';
import type { UserRepositoryPort } from '../../../domain/repositories/user.repository.interface';
import type { RegisterUserInput } from './register-user.dto';

export class RegisterUserUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(input: RegisterUserInput): Promise<User> {
    return this.userRepository.create({
      email: input.email,
      status: input.status ?? 'active',
    });
  }
}
