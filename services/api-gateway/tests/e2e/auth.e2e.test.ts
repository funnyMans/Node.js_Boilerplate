import { describe, expect, it } from 'vitest';
import type { AuthAccountResponse, AuthTokenResponse, UserDto } from '@app/contracts';

const e2e = process.env.E2E === '1' ? describe : describe.skip;

e2e('gateway auth end-to-end flow', () => {
  it('registers, authenticates, protects, and revokes a user session', async () => {
    const email = `gateway-${Date.now()}@example.com`;
    const password = 'correct-horse';

    const register = await fetch('http://127.0.0.1:3000/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(register.status).toBe(201);
    const account = (await register.json()) as AuthAccountResponse;

    const login = await fetch('http://127.0.0.1:3000/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const token = (await login.json()) as AuthTokenResponse;
    expect(token.userId).toBe(account.userId);

    const unauthenticated = await fetch(`http://127.0.0.1:3000/users/${account.userId}`);
    expect(unauthenticated.status).toBe(401);

    const protectedProfile = await fetch(`http://127.0.0.1:3000/users/${account.userId}`, {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(protectedProfile.status).toBe(200);
    expect(((await protectedProfile.json()) as UserDto).id).toBe(account.userId);

    const secondEmail = `gateway-second-${Date.now()}@example.com`;
    const secondRegister = await fetch('http://127.0.0.1:3000/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: secondEmail, password }),
    });
    expect(secondRegister.status).toBe(201);
    const secondAccount = (await secondRegister.json()) as AuthAccountResponse;

    const secondLogin = await fetch('http://127.0.0.1:3000/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: secondEmail, password }),
    });
    expect(secondLogin.status).toBe(200);
    const secondToken = (await secondLogin.json()) as AuthTokenResponse;

    const crossUserProfile = await fetch(`http://127.0.0.1:3000/users/${account.userId}`, {
      headers: { authorization: `Bearer ${secondToken.accessToken}` },
    });
    expect(crossUserProfile.status).toBe(403);
    expect(secondAccount.userId).not.toBe(account.userId);

    const logout = await fetch('http://127.0.0.1:3000/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(logout.status).toBe(204);

    const revokedProfile = await fetch(`http://127.0.0.1:3000/users/${account.userId}`, {
      headers: { authorization: `Bearer ${token.accessToken}` },
    });
    expect(revokedProfile.status).toBe(401);

    await fetch('http://127.0.0.1:3000/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${secondToken.accessToken}` },
    });
  });
});
