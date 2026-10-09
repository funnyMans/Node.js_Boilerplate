import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@app/common';
import type { AuthSessionResponse, AuthTokenResponse, LoginRequest } from '@app/contracts';
import { z } from 'zod';
import { LoginUseCase } from '../../../app/use-cases/login/login.use-case';
import { RefreshSessionUseCase } from '../../../app/use-cases/refresh-session/refresh-session.use-case';
import { RevokeSessionUseCase } from '../../../app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from '../../../app/use-cases/validate-session/validate-session.use-case';
import { UsersServiceUnavailableError } from '../../../app/services/users-client.interface';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly revokeSession: RevokeSessionUseCase,
    private readonly validateSession: ValidateSessionUseCase
  ) {}

  async loginUser(request: FastifyRequest, reply: FastifyReply) {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return sendInvalidPayload(reply);

    try {
      const input: LoginRequest = parsed.data;
      const session = await this.login.execute(input);
      const response: AuthTokenResponse = {
        accessToken: session.token,
        refreshToken: session.refreshToken,
        userId: session.userId,
        roleGrants: session.roleGrants,
        expiresAt: session.expiresAt.toISOString(),
        refreshExpiresAt: session.refreshExpiresAt.toISOString(),
      };
      return reply.send(response);
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) {
        return sendAuthServiceUnavailable(reply, error.message);
      }
      if (!(error instanceof Error) || error.message !== 'Invalid credentials') throw error;
      return sendInvalidSession(reply, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }
  }

  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const parsed = z.object({ refreshToken: z.string().trim().min(1) }).safeParse(request.body);
    if (!parsed.success) return sendInvalidPayload(reply);

    try {
      const session = await this.refreshSession.execute(parsed.data.refreshToken);
      const response: AuthTokenResponse = {
        accessToken: session.token,
        refreshToken: session.refreshToken,
        userId: session.userId,
        roleGrants: session.roleGrants,
        expiresAt: session.expiresAt.toISOString(),
        refreshExpiresAt: session.refreshExpiresAt.toISOString(),
      };
      return reply.send(response);
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) {
        return sendAuthServiceUnavailable(reply, error.message);
      }
      if (!(error instanceof Error) || error.message !== 'Invalid refresh token') throw error;
      return sendInvalidSession(reply, 'Invalid session', 'INVALID_SESSION');
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (token) await this.revokeSession.execute(token);
    return reply.status(204).send();
  }

  async session(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) return sendInvalidSession(reply, 'Invalid session', 'INVALID_SESSION');

    let session;
    try {
      session = await this.validateSession.execute(token);
    } catch (error) {
      if (!(error instanceof UsersServiceUnavailableError)) throw error;
      return sendAuthServiceUnavailable(reply, error.message);
    }
    if (!session) return sendInvalidSession(reply, 'Invalid session', 'INVALID_SESSION');

    const response: AuthSessionResponse = {
      valid: true,
      userId: session.userId,
      roleGrants: session.roleGrants,
      expiresAt: session.expiresAt.toISOString(),
    };
    return reply.send(response);
  }
}

function sendInvalidPayload(reply: FastifyReply) {
  const error = new AppError('Invalid payload', {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    category: 'validation',
  });
  return reply.status(400).send(error.toResponse());
}

function sendInvalidSession(
  reply: FastifyReply,
  message: string,
  code: 'INVALID_CREDENTIALS' | 'INVALID_SESSION'
) {
  const error = new AppError(message, {
    code,
    statusCode: 401,
    category: 'auth',
  });
  return reply.status(401).send(error.toResponse());
}

function sendAuthServiceUnavailable(reply: FastifyReply, message: string) {
  const error = new AppError(message, {
    code: 'AUTH_SERVICE_UNAVAILABLE',
    statusCode: 502,
    category: 'dependency',
    retryable: true,
  });
  return reply.status(502).send(error.toResponse());
}
