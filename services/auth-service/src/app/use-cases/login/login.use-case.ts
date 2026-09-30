import type { Session } from '../../../domain/models/session.entity';
import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { PasswordHasher } from '../../services/password-hasher.interface';
import type { LoginInput } from './login.dto';

export class LoginUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessionLifetimeMs = 1000 * 60 * 60 * 24 * 7,
    private readonly refreshLifetimeMs = 1000 * 60 * 60 * 24 * 30
  ) {}

  async execute(input: LoginInput): Promise<Session> {
    const credential = await this.authRepository.findCredentialByEmail(input.email);
    if (
      !credential ||
      !(await this.passwordHasher.verify(input.password, credential.passwordHash))
    ) {
      throw new Error('Invalid credentials');
    }

    return this.authRepository.createSession({
      credentialId: credential.id,
      userId: credential.userId,
      role: credential.role,
      token: this.passwordHasher.randomToken(),
      refreshToken: this.passwordHasher.randomToken(),
      expiresAt: new Date(Date.now() + this.sessionLifetimeMs),
      refreshExpiresAt: new Date(Date.now() + this.refreshLifetimeMs),
    });
  }
}
