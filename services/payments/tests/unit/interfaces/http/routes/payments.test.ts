import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPaymentRoutes } from '../../../../../src/interfaces/http/routes/payments';

describe('payment routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  function createServer(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
    const server = Fastify();
    servers.push(server);
    const service = {
      createSetupIntent: vi.fn(),
      selectDefaultPaymentMethod: vi.fn(),
      charge: vi.fn(),
      refund: vi.fn(),
      ...overrides,
    };
    registerPaymentRoutes(server, service);
    return { server, service };
  }

  it('does not expose provider details when setup-intent creation fails', async () => {
    const { server } = createServer({
      createSetupIntent: vi.fn().mockRejectedValue(new Error('stripe secret response details')),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/payment-methods/setup-intents',
      headers: { 'x-authenticated-user-id': 'user-1' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Payment request failed', code: 'internal_error' });
    expect(response.body).not.toContain('stripe secret response details');
  });

  it('does not expose repository details when charge processing fails', async () => {
    const { server } = createServer({
      charge: vi.fn().mockRejectedValue(new Error('database connection string')),
    });

    const response = await server.inject({
      method: 'POST',
      url: '/payments/charges',
      headers: { 'x-service-token': 'valid-service-token' },
      payload: {
        orderId: 'order-1',
        userId: 'user-1',
        items: [{ productId: 'sku-1', quantity: 1 }],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Payment request failed', code: 'internal_error' });
    expect(response.body).not.toContain('database connection string');
  });
});
