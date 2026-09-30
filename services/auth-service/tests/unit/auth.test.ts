import { describe, expect, it } from 'vitest';
import { LoginUseCase } from '../../src/app/use-cases/login/login.use-case';
import { RegisterAccountUseCase } from '../../src/app/use-cases/register-account/register-account.use-case';
import { RegisterCredentialsUseCase } from '../../src/app/use-cases/register-credentials/register-credentials.use-case';
import { RefreshSessionUseCase } from '../../src/app/use-cases/refresh-session/refresh-session.use-case';
import { RevokeSessionUseCase } from '../../src/app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from '../../src/app/use-cases/validate-session/validate-session.use-case';
import type {
  AuthRepositoryPort,
  CreateCredentialPayload,
  CreateSessionPayload,
} from '../../src/domain/repositories/auth.repository.interface';
import { Credential } from '../../src/domain/models/credential.entity';
import { Session } from '../../src/domain/models/session.entity';
import type { PasswordHasher } from '../../src/app/services/password-hasher.interface';
import type { UsersClientPort } from '../../src/app/services/users-client.interface';

class InMemoryAuthRepository implements AuthRepositoryPort {
  credential: Credential | null = null;
  session: Session | null = null;
  revokedToken: string | null = null;
  revokedRefreshToken: string | null = null;
  refreshSession: Session | null = null;

  findCredentialByEmail(email: string) {
    return Promise.resolve(this.credential?.email === email ? this.credential : null);
  }

  createCredential(input: CreateCredentialPayload) {
    this.credential = new Credential(
      'credential-1',
      input.userId,
      input.email,
      input.passwordHash,
      input.role ?? 'user'
    );
    return Promise.resolve(this.credential);
  }

  createSession(input: CreateSessionPayload) {
    this.session = new Session(
      'session-1',
      input.token,
      input.refreshToken,
      input.userId,
      input.role,
      input.expiresAt,
      input.refreshExpiresAt
    );
    this.refreshSession = this.session;
    return Promise.resolve(this.session);
  }

  revokeSession(token: string) {
    this.revokedToken = token;
    return Promise.resolve();
  }

  revokeSessionByRefreshToken(refreshToken: string) {
    this.revokedRefreshToken = refreshToken;
    return Promise.resolve();
  }

  findActiveSession(token: string) {
    if (token === this.revokedToken || !this.session) return Promise.resolve(null);
    return Promise.resolve({
      userId: this.session.userId,
      role: this.session.role,
      expiresAt: this.session.expiresAt,
    });
  }

  findActiveSessionByRefreshToken(refreshToken: string) {
    if (refreshToken === this.revokedRefreshToken || !this.session) return Promise.resolve(null);
    return Promise.resolve({
      id: this.session.id,
      userId: this.session.userId,
      role: this.session.role,
      credentialId: 'credential-1',
      expiresAt: this.session.expiresAt,
      refreshExpiresAt: this.session.refreshExpiresAt,
      token: this.session.token,
      refreshToken: this.session.refreshToken,
    });
  }
}

class FakePasswordHasher implements PasswordHasher {
  hash(value: string) {
    return Promise.resolve(`hashed:${value}`);
  }

  verify(value: string, digest: string) {
    return Promise.resolve(digest === `hashed:${value}`);
  }

  private tokens = ['session-token', 'refresh-token'];

  randomToken() {
    return this.tokens.shift() ?? 'token';
  }
}

class FakeUsersClient implements UsersClientPort {
  createdEmails: string[] = [];

  createUser(input: { email: string }) {
    this.createdEmails.push(input.email);
    return Promise.resolve({ id: 'user-1', email: input.email });
  }
}

describe('auth use cases', () => {
  it('registers credentials without persisting the raw password', async () => {
    const repository = new InMemoryAuthRepository();
    const useCase = new RegisterCredentialsUseCase(repository, new FakePasswordHasher());

    const credential = await useCase.execute({
      userId: 'user-1',
      email: 'person@example.com',
      password: 'correct-horse',
    });

    expect(credential.passwordHash).toBe('hashed:correct-horse');
  });

  it('creates a session after valid login', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    await new RegisterCredentialsUseCase(repository, hasher).execute({
      userId: 'user-1',
      email: 'person@example.com',
      password: 'correct-horse',
    });

    const session = await new LoginUseCase(repository, hasher).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });

    expect(session.token).toBe('session-token');
    expect(session.userId).toBe('user-1');
  });

  it('rotates a valid refresh token into a new session', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    await new RegisterCredentialsUseCase(repository, hasher).execute({
      userId: 'user-1',
      email: 'person@example.com',
      password: 'correct-horse',
    });
    await new LoginUseCase(repository, hasher).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });

    const refreshed = await new RefreshSessionUseCase(repository, hasher).execute('refresh-token');

    expect(refreshed).toMatchObject({ userId: 'user-1', role: 'user' });
    expect(repository.revokedRefreshToken).toBe('refresh-token');
  });

  it('revokes the supplied session token', async () => {
    const repository = new InMemoryAuthRepository();
    await new RevokeSessionUseCase(repository).execute('session-token');

    expect(repository.revokedToken).toBe('session-token');
  });

  it('validates an active session and rejects it after revocation', async () => {
    const repository = new InMemoryAuthRepository();
    const hasher = new FakePasswordHasher();
    await new RegisterCredentialsUseCase(repository, hasher).execute({
      userId: 'user-1',
      email: 'person@example.com',
      password: 'correct-horse',
    });
    await new LoginUseCase(repository, hasher).execute({
      email: 'person@example.com',
      password: 'correct-horse',
    });

    const validate = new ValidateSessionUseCase(repository);
    expect(await validate.execute('session-token')).toMatchObject({ userId: 'user-1' });

    await new RevokeSessionUseCase(repository).execute('session-token');
    expect(await validate.execute('session-token')).toBeNull();
  });

  it('creates the users-service user before storing auth credentials', async () => {
    const repository = new InMemoryAuthRepository();
    const usersClient = new FakeUsersClient();
    const hasher = new FakePasswordHasher();

    const credential = await new RegisterAccountUseCase(
      usersClient,
      new RegisterCredentialsUseCase(repository, hasher)
    ).execute({ email: 'person@example.com', password: 'correct-horse' });

    expect(usersClient.createdEmails).toEqual(['person@example.com']);
    expect(credential.userId).toBe('user-1');
    expect(repository.credential?.passwordHash).toBe('hashed:correct-horse');
  });

  it('does not create a second user when credentials already exist', async () => {
    const repository = new InMemoryAuthRepository();
    const usersClient = new FakeUsersClient();
    const hasher = new FakePasswordHasher();
    await new RegisterCredentialsUseCase(repository, hasher).execute({
      userId: 'user-1',
      email: 'person@example.com',
      password: 'correct-horse',
    });

    await expect(
      new RegisterAccountUseCase(
        usersClient,
        new RegisterCredentialsUseCase(repository, hasher)
      ).execute({ email: 'person@example.com', password: 'another-password' })
    ).rejects.toThrow('Credentials already exist');

    expect(usersClient.createdEmails).toEqual([]);
  });
});
