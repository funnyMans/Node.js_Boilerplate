import type { Credential } from '../../../domain/models/credential.entity';
import type { UsersClientPort } from '../../services/users-client.interface';
import { RegisterCredentialsUseCase } from '../register-credentials/register-credentials.use-case';
import type { RegisterAccountInput } from './register-account.dto';

export class RegisterAccountUseCase {
  constructor(
    private readonly usersClient: UsersClientPort,
    private readonly registerCredentials: RegisterCredentialsUseCase
  ) {}

  async execute(input: RegisterAccountInput): Promise<Credential> {
    await this.registerCredentials.assertEmailAvailable(input.email);
    const user = await this.usersClient.createUser({ email: input.email });

    return this.registerCredentials.execute({
      userId: user.id,
      email: user.email,
      password: input.password,
    });
  }
}
