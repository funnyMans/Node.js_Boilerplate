import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { PasswordHasher } from '../../services/password-hasher.interface';
import type { UsersClientPort } from '../../services/users-client.interface';

export class RefreshSessionUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
    private readonly usersClient: UsersClientPort,
    private readonly sessionLifetimeMs = 1000 * 60 * 60 * 24 * 7,
    private readonly refreshLifetimeMs = 1000 * 60 * 60 * 24 * 30
  ) {}

  async execute(refreshToken: string) {
    const currentSession = await this.authRepository.findActiveSessionByRefreshToken(refreshToken);
    if (!currentSession) {
      throw new Error('Invalid refresh token');
    }

    if (!(await this.usersClient.isUserActive(currentSession.userId))) {
      throw new Error('Invalid refresh token');
    }

    await this.authRepository.revokeSessionByRefreshToken(refreshToken);

    return this.authRepository.createSession({
      credentialId: currentSession.credentialId,
      userId: currentSession.userId,
      role: currentSession.role,
      token: this.passwordHasher.randomToken(),
      refreshToken: this.passwordHasher.randomToken(),
      expiresAt: new Date(Date.now() + this.sessionLifetimeMs),
      refreshExpiresAt: new Date(Date.now() + this.refreshLifetimeMs),
    });
  }
}
