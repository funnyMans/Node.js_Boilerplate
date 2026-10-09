import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpUsersClient } from '../../src/infrastructure/clients/http-users.client';

describe('HttpUsersClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a deactivated user even when its status is active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ isActive: false, status: 'active' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(new HttpUsersClient('http://users').isUserActive('user-1')).resolves.toBe(false);
  });

  it('accepts a user only when both lifecycle fields are active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ isActive: true, status: 'active' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(new HttpUsersClient('http://users').isUserActive('user-1')).resolves.toBe(true);
  });

  it('creates a user from a valid users-service response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-1', email: 'person@example.com' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new HttpUsersClient('http://users').createUser({ email: 'person@example.com' })
    ).resolves.toEqual({ id: 'user-1', email: 'person@example.com' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://users/users',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('surfaces an invalid user response as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'active' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(new HttpUsersClient('http://users').isUserActive('user-1')).rejects.toThrow(
      'Users service unavailable'
    );
  });

  it.each([
    { id: 42, email: 'person@example.com' },
    { id: ' ', email: 'person@example.com' },
    { id: 'user-1', email: null },
  ])('rejects malformed user creation responses: %o', async (user) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(user), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(
      new HttpUsersClient('http://users').createUser({ email: 'person@example.com' })
    ).rejects.toThrow('Users service unavailable');
  });

  it('sends a bounded abort signal to users-service requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ isActive: true, status: 'active' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await new HttpUsersClient('http://users', 10).isUserActive('user-1');

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal?.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(options.signal?.aborted).toBe(true);
  });
});
