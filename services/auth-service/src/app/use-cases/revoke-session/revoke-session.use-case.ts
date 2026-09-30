import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';

export class RevokeSessionUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  execute(token: string): Promise<void> {
    return this.authRepository.revokeSession(token);
  }
}
