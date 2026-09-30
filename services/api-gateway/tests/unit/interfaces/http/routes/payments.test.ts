import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClientPort } from '../../../../../src/app/services/auth-client.interface';
import { registerPaymentMethodRoutes } from '../../../../../src/interfaces/http/routes/payments';

describe('payment method routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  function createServer(fetcher: typeof globalThis.fetch) {
    const server = Fastify();
    servers.push(server);
    const authClient: AuthClientPort = {
      validateSession: vi.fn().mockResolvedValue({
        valid: true,
        userId: 'user-1',
        role: 'user',
        expiresAt: '2026-09-28T00:00:00.000Z',
      }),
    };
    registerPaymentMethodRoutes(
      server,
      'http://payments.internal',
      authClient,
      'test-service-token',
      fetcher
    );
    return { server, authClient };
  }

  it('requires a valid user session before creating a SetupIntent', async () => {
    const fetcher = vi.fn();
    const { server, authClient } = createServer(fetcher);

    const response = await server.inject({
      method: 'POST',
      url: '/payments/payment-methods/setup-intents',
    });

    expect(response.statusCode).toBe(401);
    expect(authClient.validateSession).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards the authenticated owner when selecting a default payment method', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'saved' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const { server } = createServer(fetcher);

    const response = await server.inject({
      method: 'POST',
      url: '/payments/payment-methods/default',
      headers: { authorization: 'Bearer test-token', 'x-correlation-id': 'corr-1' },
      payload: { setupIntentId: 'seti_test' },
    });

    expect(response.statusCode).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      'http://payments.internal/payment-methods/default',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-authenticated-user-id': 'user-1',
          'x-service-token': 'test-service-token',
          'x-correlation-id': 'corr-1',
        }),
        body: JSON.stringify({ setupIntentId: 'seti_test' }),
      })
    );
  });
});
