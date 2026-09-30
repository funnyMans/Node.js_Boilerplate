import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PaymentServiceError } from '../../../app/errors';
import type { PaymentService } from '../../../app/payment-service';

const createChargeSchema = z.object({
  orderId: z.string().min(1),
  userId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1),
      })
    )
    .min(1),
});

const createRefundSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
});

function getErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof PaymentServiceError) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message, code: error.code },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: error instanceof Error ? error.message : fallbackMessage,
      code: 'internal_error',
    },
  };
}

export function registerPaymentRoutes(server: FastifyInstance, service: PaymentService) {
  server.post('/payment-methods/setup-intents', async (request, reply) => {
    const userId = request.headers['x-authenticated-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    try {
      return await service.createSetupIntent(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to create setup intent';
      return reply.code(500).send({ error: message });
    }
  });

  server.post('/payment-methods/default', async (request, reply) => {
    const userId = request.headers['x-authenticated-user-id'];
    if (typeof userId !== 'string' || userId.length === 0) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const parsed = z.object({ setupIntentId: z.string().min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'setupIntentId is required' });
    }

    try {
      return await service.selectDefaultPaymentMethod(userId, parsed.data.setupIntentId);
    } catch (error) {
      const result = getErrorResponse(error, 'Failed to set default payment method');
      return reply.code(result.statusCode).send(result.body);
    }
  });

  server.post('/payments/charges', async (request, reply) => {
    const serviceToken = request.headers['x-service-token'];
    if (typeof serviceToken !== 'string' || serviceToken.length === 0) {
      return reply.code(401).send({ error: 'Service token required' });
    }

    const parsed = createChargeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid charge payload' });
    }

    try {
      const result = await service.charge(parsed.data);
      if (result.status === 'declined') {
        return reply.code(402).send({ status: 'declined' });
      }
      return reply.send(result);
    } catch (error) {
      const result = getErrorResponse(error, 'Failed to charge');
      return reply.code(result.statusCode).send(result.body);
    }
  });

  server.post('/payments/refunds', async (request, reply) => {
    const serviceToken = request.headers['x-service-token'];
    if (typeof serviceToken !== 'string' || serviceToken.length === 0) {
      return reply.code(401).send({ error: 'Service token required' });
    }

    const parsed = createRefundSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid refund payload' });
    }

    try {
      return await service.refund(parsed.data);
    } catch (error) {
      const result = getErrorResponse(error, 'Failed to refund');
      return reply.code(result.statusCode).send(result.body);
    }
  });
}
