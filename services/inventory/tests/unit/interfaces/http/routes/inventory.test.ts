import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InventoryConflictError,
  InventoryService,
  type InventoryRepository,
} from '../../../../../src/app/inventory.service';
import { registerInventoryRoutes } from '../../../../../src/interfaces/http/routes/inventory';

describe('inventory routes', () => {
  const servers: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  function createServer(repository: InventoryRepository) {
    const server = Fastify();
    servers.push(server);
    registerInventoryRoutes(server, new InventoryService(repository));
    return server;
  }

  it('does not expose internal repository errors to clients', async () => {
    const repository: InventoryRepository = {
      reserve: async () => {
        throw new Error('database password leaked');
      },
      adjust: async () => {
        throw new Error('database password leaked');
      },
      getReservation: async () => null,
      getStock: async () => null,
    };
    const response = await createServer(repository).inject({
      method: 'POST',
      url: '/inventory/reservations',
      payload: { orderId: 'order-1', items: [{ productId: 'sku-1', quantity: 1 }] },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Inventory request failed' });
  });

  it('returns a conflict response for a known inventory conflict', async () => {
    const repository: InventoryRepository = {
      reserve: async () => {
        throw new InventoryConflictError('insufficient stock');
      },
      adjust: async () => {
        throw new InventoryConflictError('insufficient stock');
      },
      getReservation: async () => null,
      getStock: async () => null,
    };
    const response = await createServer(repository).inject({
      method: 'POST',
      url: '/inventory/reservations',
      payload: { orderId: 'order-1', items: [{ productId: 'sku-1', quantity: 1 }] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'insufficient stock' });
  });
});
