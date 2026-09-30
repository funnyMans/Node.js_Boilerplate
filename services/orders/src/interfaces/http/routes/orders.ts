import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getRequestTraceContext } from '@app/common';
import type { OrdersService } from '../../../app/orders.service';

type OrdersPort = Pick<OrdersService, 'create' | 'getForUser' | 'listForUser'>;

const createOrderSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().trim().min(1).max(128),
            quantity: z.number().int().min(1).max(9999),
          })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict();

const orderIdSchema = z.string().uuid();

export function registerOrderRoutes(server: FastifyInstance, orders: OrdersPort) {
  server.post('/orders', async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid order details',
        details: parsed.error.flatten(),
      });
    }

    const userId = request.headers['x-authenticated-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const correlationHeader = z
      .string()
      .min(1)
      .max(128)
      .safeParse(request.headers['x-correlation-id']);
    const correlationId = correlationHeader.success ? correlationHeader.data : randomUUID();

    const traceContext = getRequestTraceContext(request.raw);
    const order = await orders.create(userId, parsed.data, correlationId, traceContext);
    return reply
      .code(201)
      .header('location', `/orders/${order.id}`)
      .header('x-correlation-id', correlationId)
      .send(order);
  });

  server.get('/orders', async (request, reply) => {
    const userId = request.headers['x-authenticated-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid order query',
        details: parsed.error.flatten(),
      });
    }

    return { orders: await orders.listForUser(userId, parsed.data.limit) };
  });

  server.get('/orders/:id', async (request, reply) => {
    const userId = request.headers['x-authenticated-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    const params = request.params as { id: string };
    if (!orderIdSchema.safeParse(params.id).success) {
      return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invalid order ID' });
    }

    const order = await orders.getForUser(params.id, userId);
    if (!order)
      return reply.code(404).send({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return order;
  });
}
