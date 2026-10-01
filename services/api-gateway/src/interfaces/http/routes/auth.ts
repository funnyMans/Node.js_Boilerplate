import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthErrorShape } from '@app/contracts';
import { getDownstreamRequestContext } from '../../../infrastructure/clients/request-context';

const authUnavailableError: AuthErrorShape = {
  code: 'AUTH_SERVICE_UNAVAILABLE',
  message: 'Auth service unavailable',
};

async function forwardResponse(response: Response, reply: FastifyReply) {
  if (response.status === 204) return reply.code(204).send();

  const payload = await response.json().catch(() => ({ message: 'auth service error' }));
  return reply.code(response.status).send(payload);
}

export function registerAuthRoutes(server: FastifyInstance, authServiceUrl: string) {
  server.post('/auth/register', async (request, reply) => {
    try {
      const response = await fetch(`${authServiceUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...getDownstreamRequestContext(request),
        },
        body: JSON.stringify(request.body),
      });
      return forwardResponse(response, reply);
    } catch (error) {
      server.log.error(error);
      return reply.code(502).send(authUnavailableError);
    }
  });

  server.post('/auth/refresh', async (request, reply) => {
    try {
      const response = await fetch(`${authServiceUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...getDownstreamRequestContext(request),
        },
        body: JSON.stringify(request.body),
      });
      return forwardResponse(response, reply);
    } catch (error) {
      server.log.error(error);
      return reply.code(502).send(authUnavailableError);
    }
  });

  server.post('/auth/login', async (request, reply) => {
    try {
      const response = await fetch(`${authServiceUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...getDownstreamRequestContext(request),
        },
        body: JSON.stringify(request.body),
      });
      return forwardResponse(response, reply);
    } catch (error) {
      server.log.error(error);
      return reply.code(502).send(authUnavailableError);
    }
  });

  server.post('/auth/logout', async (request, reply) => {
    try {
      const response = await fetch(`${authServiceUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          ...(request.headers.authorization
            ? { authorization: request.headers.authorization }
            : {}),
          ...getDownstreamRequestContext(request),
        },
      });
      return forwardResponse(response, reply);
    } catch (error) {
      server.log.error(error);
      return reply.code(502).send(authUnavailableError);
    }
  });
}
