import type { Credential } from '../../../domain/models/credential.entity';
import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { PasswordHasher } from '../../services/password-hasher.interface';
import type { RegisterCredentialsInput } from './register-credentials.dto';

export class RegisterCredentialsUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly passwordHasher: PasswordHasher
  ) {}

  async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.authRepository.findCredentialByEmail(email);
    if (existing) throw new Error('Credentials already exist');
  }

  async execute(input: RegisterCredentialsInput): Promise<Credential> {
    await this.assertEmailAvailable(input.email);

    return this.authRepository.createCredential({
      userId: input.userId,
      email: input.email,
      passwordHash: await this.passwordHasher.hash(input.password),
      role: 'user',
    });
  }
}
