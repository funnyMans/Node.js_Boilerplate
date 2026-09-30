import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthErrorShape } from '@app/contracts';
import type {
  AuthClientPort,
  AuthenticatedSession,
} from '../../../app/services/auth-client.interface';
import { getDownstreamRequestContext } from '../../../infrastructure/clients/request-context';

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  authClient: AuthClientPort
): Promise<AuthenticatedSession | null> {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

  if (!token) {
    const error: AuthErrorShape = { code: 'INVALID_SESSION', message: 'Authentication required' };
    reply.code(401).send(error);
    return null;
  }

  try {
    const session = await authClient.validateSession(token, getDownstreamRequestContext(request));
    if (!session) {
      const error: AuthErrorShape = { code: 'INVALID_SESSION', message: 'Invalid session' };
      reply.code(401).send(error);
      return null;
    }

    return session;
  } catch {
    const error: AuthErrorShape = {
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'Auth service unavailable',
    };
    reply.code(502).send(error);
    return null;
  }
}
