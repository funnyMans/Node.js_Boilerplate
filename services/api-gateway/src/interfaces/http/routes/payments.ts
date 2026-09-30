import type { FastifyInstance } from 'fastify';
import type { AuthClientPort } from '../../../app/services/auth-client.interface';
import { authenticateRequest } from '../guards/auth.guard';

export function registerPaymentMethodRoutes(
  server: FastifyInstance,
  paymentsServiceUrl: string,
  authClient: AuthClientPort,
  serviceToServiceToken: string,
  fetcher: typeof globalThis.fetch = globalThis.fetch
) {
  server.post('/payments/payment-methods/setup-intents', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;

    try {
      const response = await fetcher(`${paymentsServiceUrl}/payment-methods/setup-intents`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-authenticated-user-id': session.userId,
          'x-service-token': serviceToServiceToken,
          'x-correlation-id': request.headers['x-correlation-id']?.toString() ?? request.id,
        },
        body: JSON.stringify({}),
      });
      return reply.code(response.status).send(await response.json());
    } catch (error) {
      server.log.error({ err: error }, 'payment service setup-intent request failed');
      return reply.code(502).send({ code: 'PAYMENTS_SERVICE_UNAVAILABLE' });
    }
  });

  server.post('/payments/payment-methods/default', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;

    try {
      const response = await fetcher(`${paymentsServiceUrl}/payment-methods/default`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-authenticated-user-id': session.userId,
          'x-service-token': serviceToServiceToken,
          'x-correlation-id': request.headers['x-correlation-id']?.toString() ?? request.id,
        },
        body: JSON.stringify(request.body),
      });
      return reply.code(response.status).send(await response.json());
    } catch (error) {
      server.log.error({ err: error }, 'payment service default-method request failed');
      return reply.code(502).send({ code: 'PAYMENTS_SERVICE_UNAVAILABLE' });
    }
  });
}
