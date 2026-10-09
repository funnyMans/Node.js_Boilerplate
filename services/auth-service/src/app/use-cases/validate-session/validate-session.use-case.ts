import type {
  ActiveSession,
  AuthRepositoryPort,
} from '../../../domain/repositories/auth.repository.interface';
import type { JwtTokenService } from '../../services/jwt-token-service.interface';
import type { UsersClientPort } from '../../services/users-client.interface';

export class ValidateSessionUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersClient: UsersClientPort
  ) {}

  async execute(token: string): Promise<ActiveSession | null> {
    const verifiedToken = await this.jwtTokenService.verifyAccessToken(token);
    if (!verifiedToken) return null;
    const session = await this.authRepository.findActiveSession(token);
    if (!session || session.userId !== verifiedToken.userId) {
      return null;
    }
    if (!(await this.usersClient.isUserActive(session.userId))) {
      await this.authRepository.revokeCredentialSessions(session.credentialId);
      return null;
    }
    return session;
  }
}
