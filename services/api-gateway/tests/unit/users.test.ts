import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClientPort } from '../../src/app/services/auth-client.interface';
import { registerUserRoutes } from '../../src/interfaces/http/routes/users';

const session = {
  valid: true as const,
  userId: 'user-1',
  role: 'user' as const,
  expiresAt: '2026-09-28T00:00:00.000Z',
};

describe('api gateway user routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createTestServer(authClient: AuthClientPort) {
    const server = Fastify();
    registerUserRoutes(server, 'http://users.internal:3001', authClient);
    return server;
  }

  it('does not allow users to change their own account status', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => session });

    const response = await server.inject({
      method: 'PATCH',
      url: '/users/user-1',
      headers: { authorization: 'Bearer session-token' },
      payload: { firstName: 'Nora', status: 'active' },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await server.close();
  });

  it('forwards profile updates without allowing extra status fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-1', firstName: 'Nora' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => session });

    const response = await server.inject({
      method: 'PATCH',
      url: '/users/user-1',
      headers: { authorization: 'Bearer session-token' },
      payload: { firstName: 'Nora' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://users.internal:3001/users/user-1',
      expect.objectContaining({
        body: JSON.stringify({ firstName: 'Nora' }),
        headers: expect.objectContaining({
          'x-authenticated-user-id': 'user-1',
          'x-correlation-id': expect.any(String),
        }),
      })
    );
    await server.close();
  });

  it.each([
    { method: 'GET' as const, payload: undefined },
    { method: 'PATCH' as const, payload: { firstName: 'Nora' } },
  ])('encodes user IDs before forwarding $method requests', async ({ method, payload }) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user/extra' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const adminSession = { ...session, role: 'admin' as const };
    const server = createTestServer({ validateSession: async () => adminSession });
    server.addHook('onRequest', async (request) => {
      request.headers.authorization = 'Bearer test-token';
    });

    const response = await server.inject({
      method,
      url: '/users/user%2Fextra',
      headers: { authorization: 'Bearer test-token' },
      payload,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://users.internal:3001/users/user%2Fextra',
      expect.any(Object)
    );
    await server.close();
  });

  it.each(['blocked', 'active'] as const)(
    'allows an admin to change user status to %s',
    async (status) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'user-2', status }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);
      const adminSession = { ...session, role: 'admin' as const };
      const server = createTestServer({ validateSession: async () => adminSession });

      const response = await server.inject({
        method: 'PATCH',
        url: '/users/user-2',
        headers: { authorization: 'Bearer test-token' },
        payload: { status },
      });

      expect(response.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://users.internal:3001/users/user-2',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
      );
      await server.close();
    }
  );
});
