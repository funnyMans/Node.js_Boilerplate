import { describe, expect, it } from 'vitest';
import type { AuthRoleGrant } from '@app/contracts';
import { LoginUseCase } from '../../src/app/use-cases/login/login.use-case';
import { ProvisionAccountUseCase } from '../../src/app/use-cases/provision-account/provision-account.use-case';
import { RefreshSessionUseCase } from '../../src/app/use-cases/refresh-session/refresh-session.use-case';
import { RevokeSessionUseCase } from '../../src/app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from '../../src/app/use-cases/validate-session/validate-session.use-case';
import type { JwtTokenService } from '../../src/app/services/jwt-token-service.interface';
import type { PasswordHasher } from '../../src/app/services/password-hasher.interface';
import type { UsersClientPort } from '../../src/app/services/users-client.interface';
import { Credential } from '../../src/domain/models/credential.entity';
import { Session } from '../../src/domain/models/session.entity';
import type {
  ActiveSession,
  AuthRepositoryPort,
  CreateCredentialPayload,
  CreateSessionPayload,
  RotateSessionPayload,
} from '../../src/domain/repositories/auth.repository.interface';

const driverGrants: AuthRoleGrant[] = [{ role: 'in_house_driver' }];

class InMemoryAuthRepository implements AuthRepositoryPort {
  credential: Credential | null = null;
  revokedToken: string | null = null;
  revokedRefreshToken: string | null = null;
  private readonly sessionsByAccess = new Map<string, Session>();
  private readonly sessionsByRefresh = new Map<string, Session>();
  private nextSessionId = 1;

  findCredentialByEmail(email: string) {
    return Promise.resolve(this.credential?.email === email ? this.credential : null);
  }

  createCredential(input: CreateCredentialPayload) {
    this.credential = new Credential(
      'credential-1',
      input.userId,
      input.email,
      input.passwordHash,
      input.roleGrants
    );
    return Promise.resolve(this.credential);
  }

  replaceCredentialRoleGrants(credentialId: string, grants: AuthRoleGrant[], passwordHash: string) {
    if (!this.credential || this.credential.id !== credentialId) {
      return Promise.reject(new Error('Credential not found'));
    }
    this.credential = new Credential(
      this.credential.id,
      this.credential.userId,
      this.credential.email,
      passwordHash,
      grants
    );
    for (const [token, session] of this.sessionsByAccess) {
      if (session.userId === this.credential.userId) {
        this.sessionsByAccess.delete(token);
        this.sessionsByRefresh.delete(session.refreshToken);
      }
    }
    return Promise.resolve(this.credential);
  }

  createSession(input: CreateSessionPayload) {
    const session = this.createSessionRecord(input);
    this.sessionsByAccess.set(input.token, session);
    this.sessionsByRefresh.set(input.refreshToken, session);
    return Promise.resolve(session);
  }

  async rotateSession(input: RotateSessionPayload) {
    const current = this.sessionsByRefresh.get(input.currentRefreshToken);
    if (!current || input.currentRefreshToken === this.revokedRefreshToken) {
      throw new Error('Invalid refresh token');
    }
    this.sessionsByRefresh.delete(input.currentRefreshToken);
    this.sessionsByAccess.delete(current.token);
    this.revokedRefreshToken = input.currentRefreshToken;
    return this.createSession({
      ...input,
      refreshToken: input.refreshToken,
    });
  }

  revokeSession(token: string) {
    this.revokedToken = token;
    const session = this.sessionsByAccess.get(token);
    if (session) {
      this.sessionsByAccess.delete(token);
      this.sessionsByRefresh.delete(session.refreshToken);
    }
    return Promise.resolve();
  }

  revokeCredentialSessions(credentialId: string) {
    if (credentialId === 'credential-1') {
      for (const [token, session] of this.sessionsByAccess) {
        this.sessionsByAccess.delete(token);
        this.sessionsByRefresh.delete(session.refreshToken);
      }
    }
    return Promise.resolve();
  }

  findActiveSession(token: string): Promise<ActiveSession | null> {
    const session = this.sessionsByAccess.get(token);
    return Promise.resolve(
      session
        ? {
            id: session.id,
            userId: session.userId,
            roleGrants: session.roleGrants,
            credentialId: 'credential-1',
            expiresAt: session.expiresAt,
            refreshExpiresAt: session.refreshExpiresAt,
          }
        : null
    );
  }

  findActiveSessionByRefreshToken(refreshToken: string): Promise<ActiveSession | null> {
    const session = this.sessionsByRefresh.get(refreshToken);
    return Promise.resolve(
      session
        ? {
            id: session.id,
            userId: session.userId,
            roleGrants: session.roleGrants,
            credentialId: 'credential-1',
            expiresAt: session.expiresAt,
            refreshExpiresAt: session.refreshExpiresAt,
          }
        : null
    );
  }

  private createSessionRecord(input: CreateSessionPayload) {
    return new Session(
      `session-${this.nextSessionId++}`,
      input.token,
      input.refreshToken,
      input.userId,
      input.roleGrants,
      input.expiresAt,
      input.refreshExpiresAt
    );
  }
}

class FakePasswordHasher implements PasswordHasher {
  hash(value: string) {
    return Promise.resolve(`hashed:${value}`);
  }

  verify(value: string, digest: string) {
    return Promise.resolve(digest === `hashed:${value}`);
  }

  randomToken() {
    return 'unused-token';
  }
}

class FakeJwtTokenService implements JwtTokenService {
  private nextId = 1;
  private readonly accessSubjects = new Map<string, string>();
  private readonly refreshSubjects = new Map<string, string>();

  issueAccessToken(input: { userId: string; roleGrants: AuthRoleGrant[]; expiresAt: Date }) {
    const token = `access-${this.nextId++}`;
    this.accessSubjects.set(token, input.userId);
    return Promise.resolve(token);
  }

  issueRefreshToken(input: { userId: string; expiresAt: Date }) {
    const token = `refresh-${this.nextId++}`;
    this.refreshSubjects.set(token, input.userId);
    return Promise.resolve(token);
  }

  verifyAccessToken(token: string) {
    const userId = this.accessSubjects.get(token);
    return Promise.resolve(userId ? { userId } : null);
  }

  verifyRefreshToken(token: string) {
    const userId = this.refreshSubjects.get(token);
    return Promise.resolve(userId ? { userId } : null);
  }
}

class FakeUsersClient implements UsersClientPort {
  createdEmails: string[] = [];
  active = true;

  createUser(input: { email: string }) {
    this.createdEmails.push(input.email);
    return Promise.resolve({ id: 'person-1', email: input.email });
  }

  isUserActive() {
    return Promise.resolve(this.active);
  }
}

describe('auth use cases', () => {
  it('provisions a person profile and credentials with explicit TMS grants', async () => {
    const repository = new InMemoryAuthRepository();
    const usersClient = new FakeUsersClient();
    const provision = new ProvisionAccountUseCase(
      repository,
      new FakePasswordHasher(),
      usersClient
    );

    const credential = await provision.execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });

    expect(usersClient.createdEmails).toEqual(['person@example.com']);
    expect(credential.passwordHash).toBe('hashed:correct-horse');
    expect(credential.roleGrants).toEqual(driverGrants);
  });

  it('requires at least one role grant and rejects duplicate grants', async () => {
    const provision = new ProvisionAccountUseCase(
      new InMemoryAuthRepository(),
      new FakePasswordHasher(),
      new FakeUsersClient()
    );

    await expect(
      provision.execute({
        email: 'person@example.com',
        password: 'correct-horse',
        roleGrants: [],
      })
    ).rejects.toThrow('At least one TMS role grant is required');
    await expect(
      provision.execute({
        email: 'person@example.com',
        password: 'correct-horse',
        roleGrants: [...driverGrants, ...driverGrants],
      })
    ).rejects.toThrow('Duplicate TMS role grant');
    await expect(
      provision.execute({
        email: 'person@example.com',
        password: 'correct-horse',
        roleGrants: [{ role: 'area_supervisor' }],
      })
    ).rejects.toThrow('area_supervisor role grants require an area scope');
  });

  it('issues access and refresh JWTs after valid login', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });

    const session = await new LoginUseCase(
      repository,
      hasher,
      usersClient,
      new FakeJwtTokenService()
    ).execute({ email: 'person@example.com', password: 'correct-horse' });

    expect(session.token).toMatch(/^access-/);
    expect(session.refreshToken).toMatch(/^refresh-/);
    expect(session.roleGrants).toEqual(driverGrants);
  });

  it('rotates and revokes refresh tokens', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    const login = await new LoginUseCase(repository, hasher, usersClient, tokens).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });
    const refresh = new RefreshSessionUseCase(repository, tokens, usersClient);

    const renewed = await refresh.execute(login.refreshToken);

    expect(renewed.refreshToken).not.toBe(login.refreshToken);
    expect(await repository.findActiveSessionByRefreshToken(login.refreshToken)).toBeNull();
    await expect(refresh.execute(login.refreshToken)).rejects.toThrow('Invalid refresh token');
  });

  it('revokes existing sessions when an operator reprovisions role grants and password', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    const provision = new ProvisionAccountUseCase(repository, hasher, usersClient);
    await provision.execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    const login = await new LoginUseCase(repository, hasher, usersClient, tokens).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });

    const updated = await provision.execute({
      email: 'person@example.com',
      password: 'new-correct-horse',
      roleGrants: [{ role: 'area_supervisor', area: 'la' }],
    });

    expect(updated.roleGrants).toEqual([{ role: 'area_supervisor', area: 'la' }]);
    expect(await repository.findActiveSession(login.token)).toBeNull();
    await expect(
      new LoginUseCase(repository, hasher, usersClient, tokens).execute({
        email: 'person@example.com',
        password: 'new-correct-horse',
      })
    ).resolves.toMatchObject({ roleGrants: [{ role: 'area_supervisor', area: 'la' }] });
  });

  it('validates signed access tokens against active server-side sessions', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    const login = await new LoginUseCase(repository, hasher, usersClient, tokens).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });
    const validate = new ValidateSessionUseCase(repository, tokens, usersClient);

    expect(await validate.execute(login.token)).toMatchObject({
      userId: 'person-1',
      roleGrants: driverGrants,
    });
    await new RevokeSessionUseCase(repository).execute(login.token);
    expect(await validate.execute(login.token)).toBeNull();
  });

  it('rejects login for inactive accounts and credentials without grants', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    usersClient.active = false;

    await expect(
      new LoginUseCase(repository, hasher, usersClient, tokens).execute({
        email: 'person@example.com',
        password: 'correct-horse',
      })
    ).rejects.toThrow('Invalid credentials');
  });

  it('revokes all active sessions when a person profile becomes inactive', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    const loginUseCase = new LoginUseCase(repository, hasher, usersClient, tokens);
    const login = await loginUseCase.execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });
    const secondLogin = await loginUseCase.execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });
    usersClient.active = false;

    await expect(
      new RefreshSessionUseCase(repository, tokens, usersClient).execute(login.refreshToken)
    ).rejects.toThrow('Invalid refresh token');
    expect(await repository.findActiveSession(login.token)).toBeNull();
    expect(await repository.findActiveSessionByRefreshToken(login.refreshToken)).toBeNull();
    expect(await repository.findActiveSession(secondLogin.token)).toBeNull();
    expect(await repository.findActiveSessionByRefreshToken(secondLogin.refreshToken)).toBeNull();
  });

  it('revokes refresh sessions when validating an access token for an inactive profile', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    const usersClient = new FakeUsersClient();
    const tokens = new FakeJwtTokenService();
    await new ProvisionAccountUseCase(repository, hasher, usersClient).execute({
      email: 'person@example.com',
      password: 'correct-horse',
      roleGrants: driverGrants,
    });
    const login = await new LoginUseCase(repository, hasher, usersClient, tokens).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });
    usersClient.active = false;

    expect(
      await new ValidateSessionUseCase(repository, tokens, usersClient).execute(login.token)
    ).toBeNull();
    expect(await repository.findActiveSessionByRefreshToken(login.refreshToken)).toBeNull();
  });
});
