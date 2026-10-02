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
});
