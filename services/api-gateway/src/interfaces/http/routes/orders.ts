import type { FastifyInstance } from 'fastify';
import type { AuthClientPort } from '../../../app/services/auth-client.interface';
import { authenticateRequest } from '../guards/auth.guard';
import { getDownstreamRequestContext } from '../../../infrastructure/clients/request-context';

export function registerOrderRoutes(
  server: FastifyInstance,
  ordersServiceUrl: string,
  authClient: AuthClientPort
) {
  server.post('/orders', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-authenticated-user-id': session.userId,
        ...getDownstreamRequestContext(request),
      };
      const response = await fetch(`${ordersServiceUrl}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
      });
      const payload = await response.json();
      const correlationId = response.headers.get('x-correlation-id') ?? headers['x-correlation-id'];
      reply.code(response.status).header('x-correlation-id', correlationId);
      const traceId = response.headers.get('x-trace-id');
      if (traceId) reply.header('x-trace-id', traceId);
      return reply.send(payload);
    } catch (error) {
      server.log.error({ err: error }, 'orders service request failed');
      return reply.code(502).send({ code: 'ORDERS_SERVICE_UNAVAILABLE' });
    }
  });

  server.get('/orders', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;

    try {
      const params = new URLSearchParams();
      const query = request.query as Record<string, unknown>;
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
      }

      const queryString = params.toString();
      const url = queryString
        ? `${ordersServiceUrl}/orders?${queryString}`
        : `${ordersServiceUrl}/orders`;
      const requestContext = getDownstreamRequestContext(request);
      const response = await fetch(url, {
        headers: {
          'x-authenticated-user-id': session.userId,
          ...requestContext,
        },
      });
      const correlationId =
        response.headers.get('x-correlation-id') ?? requestContext['x-correlation-id'];
      reply.header('x-correlation-id', correlationId);
      const traceId = response.headers.get('x-trace-id');
      if (traceId) reply.header('x-trace-id', traceId);
      return reply.code(response.status).send(await response.json());
    } catch (error) {
      server.log.error({ err: error }, 'orders service request failed');
      return reply.code(502).send({ code: 'ORDERS_SERVICE_UNAVAILABLE' });
    }
  });

  server.get('/orders/:id', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;
    const { id } = request.params as { id: string };

    try {
      const requestContext = getDownstreamRequestContext(request);
      const response = await fetch(`${ordersServiceUrl}/orders/${encodeURIComponent(id)}`, {
        headers: {
          'x-authenticated-user-id': session.userId,
          ...requestContext,
        },
      });
      const correlationId =
        response.headers.get('x-correlation-id') ?? requestContext['x-correlation-id'];
      reply.header('x-correlation-id', correlationId);
      const traceId = response.headers.get('x-trace-id');
      if (traceId) reply.header('x-trace-id', traceId);
      return reply.code(response.status).send(await response.json());
    } catch (error) {
      server.log.error({ err: error }, 'orders service request failed');
      return reply.code(502).send({ code: 'ORDERS_SERVICE_UNAVAILABLE' });
    }
  });
}
