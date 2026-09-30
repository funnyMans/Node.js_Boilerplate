import type { FastifyInstance } from 'fastify';
import type { ForbiddenError } from '@app/contracts';
import type { AuthClientPort } from '../../../app/services/auth-client.interface';
import { userAccessPolicy } from '../../../app/policies/user-access.policy';
import { authenticateRequest } from '../guards/auth.guard';

export function registerUserRoutes(
  server: FastifyInstance,
  usersServiceUrl: string,
  authClient: AuthClientPort
) {
  server.get('/users', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;
    if (!userAccessPolicy.canListUsers(session.role)) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'Admin access required' };
      return reply.code(403).send(error);
    }

    try {
      const params = new URLSearchParams();
      const query = request.query as Record<string, unknown>;

      for (const [key, value] of Object.entries(query ?? {})) {
        if (value === undefined || value === null || value === '') continue;
        params.set(key, String(value));
      }

      const queryString = params.toString();
      const url = queryString
        ? `${usersServiceUrl}/users?${queryString}`
        : `${usersServiceUrl}/users`;

      const res = await fetch(url);
      if (!res.ok) return reply.code(res.status).send({ error: 'users service error' });
      return res.json();
    } catch (err) {
      server.log.error(err);
      return reply.code(502).send({ error: 'bad gateway' });
    }
  });

  server.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;
    if (!userAccessPolicy.canAccessUser(session.userId, id, session.role)) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'User access denied' };
      return reply.code(403).send(error);
    }

    try {
      const res = await fetch(`${usersServiceUrl}/users/${id}`, {
        headers: { 'x-authenticated-user-id': session.userId },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'users service error' }));
        return reply.code(res.status).send(payload);
      }
      return res.json();
    } catch (err) {
      server.log.error(err);
      return reply.code(502).send({ error: 'bad gateway' });
    }
  });

  server.patch('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;

    const isSelfUpdate = userAccessPolicy.canAccessUser(session.userId, id, session.role);
    const isAdminBan =
      request.body &&
      typeof request.body === 'object' &&
      'status' in request.body &&
      request.body.status === 'blocked' &&
      userAccessPolicy.canBanUser(session.role);

    if (!isSelfUpdate && !isAdminBan) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'User access denied' };
      return reply.code(403).send(error);
    }

    try {
      const res = await fetch(`${usersServiceUrl}/users/${id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-authenticated-user-id': session.userId,
        },
        body: JSON.stringify(request.body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'users service error' }));
        return reply.code(res.status).send(payload);
      }

      return res.json();
    } catch (err) {
      server.log.error(err);
      return reply.code(502).send({ error: 'bad gateway' });
    }
  });

  server.get('/users/count', async (_request, reply) => {
    const session = await authenticateRequest(_request, reply, authClient);
    if (!session) return;
    if (!userAccessPolicy.canListUsers(session.role)) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'Admin access required' };
      return reply.code(403).send(error);
    }

    try {
      const res = await fetch(`${usersServiceUrl}/users/count`);
      if (!res.ok) return reply.code(res.status).send({ error: 'users service error' });
      return res.json();
    } catch (err) {
      server.log.error(err);
      return reply.code(502).send({ error: 'bad gateway' });
    }
  });
}
