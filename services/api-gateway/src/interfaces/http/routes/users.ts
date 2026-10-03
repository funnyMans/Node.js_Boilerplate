import type { FastifyInstance } from 'fastify';
import type { ForbiddenError } from '@app/contracts';
import { getDownstreamRequestContext } from '../../../infrastructure/clients/request-context';
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

      const res = await fetch(url, {
        headers: getDownstreamRequestContext(request),
      });
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
      const requestContext = getDownstreamRequestContext(request);
      const res = await fetch(`${usersServiceUrl}/users/${encodeURIComponent(id)}`, {
        headers: {
          'x-authenticated-user-id': session.userId,
          ...requestContext,
        },
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

    const canUpdateTarget =
      userAccessPolicy.hasPermission(session.role, 'users:update:any') ||
      (session.userId === id && userAccessPolicy.hasPermission(session.role, 'users:update:own'));
    const body =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    const profileUpdate = Object.fromEntries(
      Object.entries(body).filter(([key]) => key === 'firstName' || key === 'lastName')
    );
    const isProfileUpdate =
      Object.keys(body).length > 0 &&
      Object.keys(body).length === Object.keys(profileUpdate).length;
    const isAdminStatusChange =
      (body.status === 'blocked' || body.status === 'active') &&
      userAccessPolicy.canBanUser(session.role);

    if ((!canUpdateTarget || !isProfileUpdate) && !isAdminStatusChange) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'User access denied' };
      return reply.code(403).send(error);
    }

    try {
      const requestContext = getDownstreamRequestContext(request);
      const res = await fetch(`${usersServiceUrl}/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-authenticated-user-id': session.userId,
          ...requestContext,
        },
        body: JSON.stringify(isAdminStatusChange ? { status: body.status } : profileUpdate),
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

  server.get('/users/count', async (request, reply) => {
    const session = await authenticateRequest(request, reply, authClient);
    if (!session) return;
    if (!userAccessPolicy.canListUsers(session.role)) {
      const error: ForbiddenError = { code: 'FORBIDDEN', message: 'Admin access required' };
      return reply.code(403).send(error);
    }

    try {
      const res = await fetch(`${usersServiceUrl}/users/count`, {
        headers: getDownstreamRequestContext(request),
      });
      if (!res.ok) return reply.code(res.status).send({ error: 'users service error' });
      return res.json();
    } catch (err) {
      server.log.error(err);
      return reply.code(502).send({ error: 'bad gateway' });
    }
  });
}
