import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderDto } from '@app/contracts';
import { setRequestTraceContext } from '@app/common';
import { registerOrderRoutes } from '../../../../../src/interfaces/http/routes/orders';

const sampleOrder: OrderDto = {
  id: '0a8bca2f-3d77-4ca3-9a4e-4ca865920d4b',
  userId: 'user-1',
  status: 'pending',
  items: [{ productId: 'sku-1', quantity: 2 }],
  createdAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
};

describe('orders API routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  function createTestServer() {
    const server = Fastify();
    servers.push(server);
    server.addHook('onRequest', async (request) => {
      setRequestTraceContext(request.raw, {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      });
    });
    const orders = {
      create: vi.fn().mockResolvedValue(sampleOrder),
      getForUser: vi.fn().mockResolvedValue(sampleOrder),
      listForUser: vi.fn().mockResolvedValue([sampleOrder]),
    };
    registerOrderRoutes(server, orders);
    return { server, orders };
  }

  it('requires an authenticated user before accepting an order', async () => {
    const { server, orders } = createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/orders',
      payload: { items: [{ productId: 'sku-1', quantity: 1 }] },
    });

    expect(response.statusCode).toBe(401);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects invalid and caller-priced order items', async () => {
    const { server, orders } = createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'x-authenticated-user-id': 'user-1' },
      payload: { items: [{ productId: 'sku-1', quantity: 1, unitPrice: 0.01 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('creates an order with the authenticated owner and correlation ID', async () => {
    const { server, orders } = createTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/orders',
      headers: {
        'x-authenticated-user-id': 'user-1',
        'x-correlation-id': 'correlation-1',
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      },
      payload: { items: [{ productId: 'sku-1', quantity: 2 }] },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/orders/${sampleOrder.id}`);
    expect(response.json()).toEqual(sampleOrder);
    expect(orders.create).toHaveBeenCalledWith(
      'user-1',
      { items: [{ productId: 'sku-1', quantity: 2 }] },
      'correlation-1',
      {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      }
    );
  });

  it('scopes order lookups to the authenticated user', async () => {
    const { server, orders } = createTestServer();
    const response = await server.inject({
      method: 'GET',
      url: `/orders/${sampleOrder.id}`,
      headers: { 'x-authenticated-user-id': 'user-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(orders.getForUser).toHaveBeenCalledWith(sampleOrder.id, 'user-1');
  });
});
