import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClientPort } from '../../src/app/services/auth-client.interface';
import { registerOrderRoutes } from '../../src/interfaces/http/routes/orders';

const session = {
  valid: true as const,
  userId: 'user-1',
  role: 'user' as const,
  expiresAt: '2026-09-28T00:00:00.000Z',
};

describe('api gateway order routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    vi.unstubAllGlobals();
  });

  function createTestServer(authClient: AuthClientPort) {
    const server = Fastify();
    servers.push(server);
    registerOrderRoutes(server, 'http://orders.internal:3003', authClient);
    return server;
  }

  it('requires a valid session before forwarding order requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => null });

    const response = await server.inject({ method: 'GET', url: '/orders' });

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the session owner and correlation ID to the orders service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'order-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json', 'x-trace-id': 'trace-1' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const server = createTestServer({ validateSession: async () => session });

    const response = await server.inject({
      method: 'POST',
      url: '/orders',
      headers: {
        authorization: 'Bearer session-token',
        'x-correlation-id': 'corr-1',
      },
      payload: { items: [{ productId: 'sku-1', quantity: 2 }] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-trace-id']).toBe('trace-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://orders.internal:3003/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-authenticated-user-id': 'user-1',
          'x-correlation-id': 'corr-1',
        }),
      })
    );
  });
});
