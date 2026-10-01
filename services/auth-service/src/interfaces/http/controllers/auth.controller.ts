import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@app/common';
import type {
  AuthAccountResponse,
  AuthSessionResponse,
  AuthTokenResponse,
  LoginRequest,
  RegisterAccountRequest,
} from '@app/contracts';
import { z } from 'zod';
import { LoginUseCase } from '../../../app/use-cases/login/login.use-case';
import { RefreshSessionUseCase } from '../../../app/use-cases/refresh-session/refresh-session.use-case';
import { RegisterAccountUseCase } from '../../../app/use-cases/register-account/register-account.use-case';
import { RevokeSessionUseCase } from '../../../app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from '../../../app/use-cases/validate-session/validate-session.use-case';
import { UsersServiceUnavailableError } from '../../../app/services/users-client.interface';

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly login: LoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly revokeSession: RevokeSessionUseCase,
    private readonly validateSession: ValidateSessionUseCase
  ) {}

  async register(request: FastifyRequest, reply: FastifyReply) {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      const error = new AppError('Invalid payload', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'validation',
      });
      return reply.status(400).send(error.toResponse());
    }

    try {
      const input: RegisterAccountRequest = parsed.data;
      const credential = await this.registerAccount.execute(input);
      const response: AuthAccountResponse = {
        userId: credential.userId,
        email: credential.email,
      };
      return reply.status(201).send(response);
    } catch (error) {
      if (error instanceof Error && error.message === 'Credentials already exist') {
        const appError = new AppError(error.message, {
          code: 'CREDENTIALS_ALREADY_EXIST',
          statusCode: 409,
          category: 'business',
        });
        return reply.status(409).send(appError.toResponse());
      }
      if (error instanceof Error && error.message === 'Users service unavailable') {
        const appError = new AppError(error.message, {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          statusCode: 502,
          category: 'dependency',
          retryable: true,
        });
        return reply.status(502).send(appError.toResponse());
      }
      throw error;
    }
  }

  async loginUser(request: FastifyRequest, reply: FastifyReply) {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      const error = new AppError('Invalid payload', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'validation',
      });
      return reply.status(400).send(error.toResponse());
    }

    try {
      const input: LoginRequest = parsed.data;
      const session = await this.login.execute(input);
      const response: AuthTokenResponse = {
        accessToken: session.token,
        refreshToken: session.refreshToken,
        userId: session.userId,
        role: session.role,
        expiresAt: session.expiresAt.toISOString(),
      };
      return reply.send(response);
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) {
        const appError = new AppError(error.message, {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          statusCode: 502,
          category: 'dependency',
          retryable: true,
        });
        return reply.status(502).send(appError.toResponse());
      }
      if (!(error instanceof Error) || error.message !== 'Invalid credentials') throw error;

      const authError = new AppError('Invalid credentials', {
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
        category: 'auth',
      });
      return reply.status(401).send(authError.toResponse());
    }
  }

  async refreshToken(request: FastifyRequest, reply: FastifyReply) {
    const parsed = z
      .object({
        refreshToken: z.string().trim().min(1),
      })
      .safeParse(request.body);

    if (!parsed.success) {
      const error = new AppError('Invalid payload', {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        category: 'validation',
      });
      return reply.status(400).send(error.toResponse());
    }

    try {
      const session = await this.refreshSession.execute(parsed.data.refreshToken);
      const response: AuthTokenResponse = {
        accessToken: session.token,
        refreshToken: session.refreshToken,
        userId: session.userId,
        role: session.role,
        expiresAt: session.expiresAt.toISOString(),
      };
      return reply.send(response);
    } catch (error) {
      if (error instanceof UsersServiceUnavailableError) {
        const appError = new AppError(error.message, {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          statusCode: 502,
          category: 'dependency',
          retryable: true,
        });
        return reply.status(502).send(appError.toResponse());
      }
      if (!(error instanceof Error) || error.message !== 'Invalid refresh token') throw error;

      const authError = new AppError('Invalid session', {
        code: 'INVALID_SESSION',
        statusCode: 401,
        category: 'auth',
      });
      return reply.status(401).send(authError.toResponse());
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) return reply.status(204).send();

    await this.revokeSession.execute(token);
    return reply.status(204).send();
  }

  async session(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) {
      const error = new AppError('Invalid session', {
        code: 'INVALID_SESSION',
        statusCode: 401,
        category: 'auth',
      });
      return reply.status(401).send(error.toResponse());
    }

    let session;
    try {
      session = await this.validateSession.execute(token);
    } catch (error) {
      if (!(error instanceof UsersServiceUnavailableError)) throw error;
      const appError = new AppError(error.message, {
        code: 'AUTH_SERVICE_UNAVAILABLE',
        statusCode: 502,
        category: 'dependency',
        retryable: true,
      });
      return reply.status(502).send(appError.toResponse());
    }
    if (!session) {
      const error = new AppError('Invalid session', {
        code: 'INVALID_SESSION',
        statusCode: 401,
        category: 'auth',
      });
      return reply.status(401).send(error.toResponse());
    }

    const response: AuthSessionResponse = {
      valid: true,
      userId: session.userId,
      role: session.role,
      expiresAt: session.expiresAt.toISOString(),
    };
    return reply.send(response);
  }
}
