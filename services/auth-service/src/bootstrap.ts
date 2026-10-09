import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import {
  checkDependencyHealth,
  createLogger,
  createServiceBootstrap,
  getHttpDependencyHealth,
  registerServiceMetrics,
} from '@app/common';
import { LoginUseCase } from './app/use-cases/login/login.use-case';
import { RefreshSessionUseCase } from './app/use-cases/refresh-session/refresh-session.use-case';
import { RevokeSessionUseCase } from './app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from './app/use-cases/validate-session/validate-session.use-case';
import { config } from './infrastructure/config';
import prisma from './infrastructure/database/prisma';
import { HttpUsersClient } from './infrastructure/clients/http-users.client';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository';
import { JoseJwtTokenService } from './infrastructure/security/jose-jwt-token.service';
import { ScryptPasswordHasher } from './infrastructure/security/scrypt-password-hasher';
import { AuthController } from './interfaces/http/controllers/auth.controller';
import { registerAuthRoutes } from './interfaces/http/routes/auth';
import { registerHealthRoutes } from './interfaces/http/routes/health';

export function createServer() {
  const logger: FastifyBaseLogger = createLogger('auth-service', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });
  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'auth-service',
    shutdownTasks: [() => prisma.$disconnect()],
  });
  const repository = new PrismaAuthRepository(prisma);
  const passwordHasher = new ScryptPasswordHasher();
  const usersClient = new HttpUsersClient(config.USERS_SERVICE_URL);
  const jwtTokenService = new JoseJwtTokenService(
    config.AUTH_ACCESS_TOKEN_SECRET,
    config.AUTH_REFRESH_TOKEN_SECRET
  );
  const controller = new AuthController(
    new LoginUseCase(
      repository,
      passwordHasher,
      usersClient,
      jwtTokenService,
      config.AUTH_ACCESS_TOKEN_LIFETIME_SECONDS * 1000,
      config.AUTH_REFRESH_TOKEN_LIFETIME_SECONDS * 1000
    ),
    new RefreshSessionUseCase(
      repository,
      jwtTokenService,
      usersClient,
      config.AUTH_ACCESS_TOKEN_LIFETIME_SECONDS * 1000,
      config.AUTH_REFRESH_TOKEN_LIFETIME_SECONDS * 1000
    ),
    new RevokeSessionUseCase(repository),
    new ValidateSessionUseCase(repository, jwtTokenService, usersClient)
  );

  registerServiceMetrics(server, 'auth-service');

  registerHealthRoutes(server, {
    database: () => checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`),
    users: () => getHttpDependencyHealth(config.USERS_SERVICE_URL),
  });

  registerAuthRoutes(server, controller);

  return { server, shutdown };
}
