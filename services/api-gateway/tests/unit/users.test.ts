import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClientPort } from '../../src/app/services/auth-client.interface';
import { registerUserRoutes } from '../../src/interfaces/http/routes/users';

const driverSession = {
  valid: true as const,
  userId: 'person-1',
  roleGrants: [{ role: 'in_house_driver' as const }],
  expiresAt: '2026-09-28T00:00:00.000Z',
};

describe('api gateway workforce routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createTestServer(authClient: AuthClientPort) {
    const server = Fastify();
    registerUserRoutes(server, 'http://users.internal:3001', authClient);
    return server;
  }

  it('does not allow a person to change their own account status', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => driverSession });

    const response = await server.inject({
      method: 'PATCH',
      url: '/users/person-1',
      headers: { authorization: 'Bearer valid-token' },
      payload: { firstName: 'Nora', status: 'active' },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await server.close();
  });

  it('forwards a self-service profile update', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'person-1', firstName: 'Nora' }));
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => driverSession });

    const response = await server.inject({
      method: 'PATCH',
      url: '/users/person-1',
      headers: { authorization: 'Bearer valid-token' },
      payload: { firstName: 'Nora' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://users.internal:3001/users/person-1',
      expect.objectContaining({
        body: JSON.stringify({ firstName: 'Nora' }),
        headers: expect.objectContaining({
          'x-authenticated-user-id': 'person-1',
          'x-correlation-id': expect.any(String),
        }),
      })
    );
    await server.close();
  });

  it('allows a company-wide executive to access another profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'person/extra' }));
    vi.stubGlobal('fetch', fetchMock);
    const executiveSession = {
      ...driverSession,
      roleGrants: [{ role: 'transportation_executive' as const }],
    };
    const server = createTestServer({ validateSession: async () => executiveSession });

    const response = await server.inject({
      method: 'GET',
      url: '/users/person%2Fextra',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://users.internal:3001/users/person%2Fextra',
      expect.any(Object)
    );
    await server.close();
  });

  it('does not treat an area supervisor grant as company-wide workforce access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const areaSupervisor = {
      ...driverSession,
      roleGrants: [{ role: 'area_supervisor' as const, area: 'la' as const }],
    };
    const server = createTestServer({ validateSession: async () => areaSupervisor });

    const response = await server.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    await server.close();
  });
});
