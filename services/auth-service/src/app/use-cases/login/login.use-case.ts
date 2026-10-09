import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { JwtTokenService } from '../../services/jwt-token-service.interface';
import type { PasswordHasher } from '../../services/password-hasher.interface';
import type { UsersClientPort } from '../../services/users-client.interface';
import type { LoginInput } from './login.dto';

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
    private readonly usersClient: UsersClientPort,
    private readonly jwtTokenService: JwtTokenService,
    private readonly sessionLifetimeMs = 1000 * 60 * 15,
    private readonly refreshLifetimeMs = 1000 * 60 * 60 * 24 * 30
  ) {}

  async execute(input: LoginInput) {
    const credential = await this.authRepository.findCredentialByEmail(input.email);
    if (
      !credential ||
      credential.roleGrants.length === 0 ||
      !(await this.passwordHasher.verify(input.password, credential.passwordHash))
    ) {
      throw new Error('Invalid credentials');
    }

    if (!(await this.usersClient.isUserActive(credential.userId))) {
      throw new Error('Invalid credentials');
    }

    const expiresAt = new Date(Date.now() + this.sessionLifetimeMs);
    const refreshExpiresAt = new Date(Date.now() + this.refreshLifetimeMs);
    const [token, refreshToken] = await Promise.all([
      this.jwtTokenService.issueAccessToken({
        userId: credential.userId,
        roleGrants: credential.roleGrants,
        expiresAt,
      }),
      this.jwtTokenService.issueRefreshToken({
        userId: credential.userId,
        expiresAt: refreshExpiresAt,
      }),
    ]);

    return this.authRepository.createSession({
      credentialId: credential.id,
      userId: credential.userId,
      roleGrants: credential.roleGrants,
      token,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
    });
  }
}
