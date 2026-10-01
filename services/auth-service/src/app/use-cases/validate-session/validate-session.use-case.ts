import type {
  ActiveSession,
  AuthRepositoryPort,
} from '../../../domain/repositories/auth.repository.interface';
import type { UsersClientPort } from '../../services/users-client.interface';

export class ValidateSessionUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly usersClient: UsersClientPort
  ) {}

  async execute(token: string): Promise<ActiveSession | null> {
    const session = await this.authRepository.findActiveSession(token);
    if (!session || !(await this.usersClient.isUserActive(session.userId))) return null;
    return session;
  }
}
