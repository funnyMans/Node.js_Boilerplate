import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { JwtTokenService } from '../../services/jwt-token-service.interface';
import type { UsersClientPort } from '../../services/users-client.interface';

export class RefreshSessionUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly jwtTokenService: JwtTokenService,
    private readonly usersClient: UsersClientPort,
    private readonly sessionLifetimeMs = 1000 * 60 * 15,
    private readonly refreshLifetimeMs = 1000 * 60 * 60 * 24 * 30
  ) {}

  async execute(refreshToken: string) {
    const verifiedToken = await this.jwtTokenService.verifyRefreshToken(refreshToken);
    if (!verifiedToken) throw new Error('Invalid refresh token');

    const currentSession = await this.authRepository.findActiveSessionByRefreshToken(refreshToken);
    if (!currentSession || currentSession.userId !== verifiedToken.userId) {
      throw new Error('Invalid refresh token');
    }

    if (!(await this.usersClient.isUserActive(currentSession.userId))) {
      await this.authRepository.revokeCredentialSessions(currentSession.credentialId);
      throw new Error('Invalid refresh token');
    }

    const expiresAt = new Date(Date.now() + this.sessionLifetimeMs);
    const refreshExpiresAt = new Date(Date.now() + this.refreshLifetimeMs);
    const [token, nextRefreshToken] = await Promise.all([
      this.jwtTokenService.issueAccessToken({
        userId: currentSession.userId,
        roleGrants: currentSession.roleGrants,
        expiresAt,
      }),
      this.jwtTokenService.issueRefreshToken({
        userId: currentSession.userId,
        expiresAt: refreshExpiresAt,
      }),
    ]);

    return this.authRepository.rotateSession({
      credentialId: currentSession.credentialId,
      userId: currentSession.userId,
      roleGrants: currentSession.roleGrants,
      token,
      refreshToken: nextRefreshToken,
      currentRefreshToken: refreshToken,
      expiresAt,
      refreshExpiresAt,
    });
  }
}
