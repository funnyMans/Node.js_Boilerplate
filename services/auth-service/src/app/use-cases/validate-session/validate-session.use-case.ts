import type {
  ActiveSession,
  AuthRepositoryPort,
} from '../../../domain/repositories/auth.repository.interface';

export class ValidateSessionUseCase {
  constructor(private readonly authRepository: AuthRepositoryPort) {}

  execute(token: string): Promise<ActiveSession | null> {
    return this.authRepository.findActiveSession(token);
  }
}
