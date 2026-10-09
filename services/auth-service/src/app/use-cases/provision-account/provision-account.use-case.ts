import type { AuthRoleGrant } from '@app/contracts';
import type { AuthRepositoryPort } from '../../../domain/repositories/auth.repository.interface';
import type { PasswordHasher } from '../../services/password-hasher.interface';
import type { UsersClientPort } from '../../services/users-client.interface';
import type { ProvisionAccountInput } from './provision-account.dto';

export class ProvisionAccountUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly passwordHasher: PasswordHasher,
    private readonly usersClient: UsersClientPort
  ) {}

  async execute(input: ProvisionAccountInput) {
    assertRoleGrants(input.roleGrants);
    const passwordHash = await this.passwordHasher.hash(input.password);

    const existing = await this.authRepository.findCredentialByEmail(input.email);
    if (existing) {
      return this.authRepository.replaceCredentialRoleGrants(
        existing.id,
        input.roleGrants,
        passwordHash
      );
    }

    const user = await this.usersClient.createUser({ email: input.email });
    return this.authRepository.createCredential({
      userId: user.id,
      email: user.email,
      passwordHash,
      roleGrants: input.roleGrants,
    });
  }
}

function assertRoleGrants(roleGrants: AuthRoleGrant[]) {
  if (roleGrants.length === 0) throw new Error('At least one TMS role grant is required');
  const keys = roleGrants.map(({ role, area }) => `${role}:${area ?? 'company'}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate TMS role grant');

  for (const { role, area } of roleGrants) {
    if ((role === 'area_supervisor' || role === 'broker') && area === undefined) {
      throw new Error(`${role} role grants require an area scope`);
    }
    if (
      area !== undefined &&
      role !== 'area_supervisor' &&
      role !== 'broker' &&
      role !== 'fleet_dispatcher'
    ) {
      throw new Error(`${role} role grants cannot have an area scope`);
    }
  }
}
