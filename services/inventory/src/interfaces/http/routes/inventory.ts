import type { FastifyInstance } from 'fastify';
import {
  InventoryConflictError,
  InventoryNotFoundError,
  InventoryService,
} from '../../../app/inventory.service';

type ReservationBody = { orderId: string; items: Array<{ productId: string; quantity: number }> };
type AdjustmentBody = { productId: string; quantity: number };

function sendError(
  server: FastifyInstance,
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown
) {
  if (error instanceof InventoryConflictError) {
    return reply.code(409).send({ error: error.message });
  }
  if (error instanceof InventoryNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }

  server.log.error({ err: error }, 'inventory request failed');
  return reply.code(500).send({ error: 'Inventory request failed' });
}

export function registerInventoryRoutes(server: FastifyInstance, service: InventoryService) {
  server.post<{ Body: ReservationBody }>(
    '/inventory/reservations',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orderId', 'items'],
          additionalProperties: false,
          properties: {
            orderId: { type: 'string', minLength: 1 },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'quantity'],
                additionalProperties: false,
                properties: {
                  productId: { type: 'string', minLength: 1 },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.reserve(request.body.orderId, request.body.items);
      } catch (error) {
        return sendError(server, reply, error);
      }
    }
  );

  server.get<{ Params: { orderId: string } }>(
    '/inventory/reservations/:orderId',
    async (request, reply) => {
      const reservation = await service.getReservation(request.params.orderId);
      return reservation ?? reply.code(404).send({ error: 'Reservation not found' });
    }
  );

  server.post<{ Body: AdjustmentBody }>(
    '/inventory/adjustments',
    {
      schema: {
        body: {
          type: 'object',
          required: ['productId', 'quantity'],
          additionalProperties: false,
          properties: {
            productId: { type: 'string', minLength: 1 },
            quantity: { type: 'integer', not: { const: 0 } },
          },
        },
      },
    },
    async (request, reply) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !key)
        return reply.code(409).send({ error: 'Idempotency-Key is required' });
      try {
        return await service.adjust(key, request.body.productId, request.body.quantity);
      } catch (error) {
        return sendError(server, reply, error);
      }
    }
  );

  server.get<{ Params: { productId: string } }>(
    '/inventory/stock/:productId',
    async (request, reply) => {
      const stock = await service.getStock(request.params.productId);
      return stock ?? reply.code(404).send({ error: 'Product not found' });
    }
  );
}
