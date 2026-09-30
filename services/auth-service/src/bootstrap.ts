import Fastify from 'fastify';
import {
  checkDependencyHealth,
  createServiceBootstrap,
  getHttpDependencyHealth,
  registerServiceMetrics,
} from '@app/common';
import { LoginUseCase } from './app/use-cases/login/login.use-case';
import { RefreshSessionUseCase } from './app/use-cases/refresh-session/refresh-session.use-case';
import { RegisterAccountUseCase } from './app/use-cases/register-account/register-account.use-case';
import { RegisterCredentialsUseCase } from './app/use-cases/register-credentials/register-credentials.use-case';
import { RevokeSessionUseCase } from './app/use-cases/revoke-session/revoke-session.use-case';
import { ValidateSessionUseCase } from './app/use-cases/validate-session/validate-session.use-case';
import { config } from './infrastructure/config';
import prisma from './infrastructure/database/prisma';
import { HttpUsersClient } from './infrastructure/clients/http-users.client';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository';
import { ScryptPasswordHasher } from './infrastructure/security/scrypt-password-hasher';
import { AuthController } from './interfaces/http/controllers/auth.controller';
import { registerAuthRoutes } from './interfaces/http/routes/auth';
import { registerHealthRoutes } from './interfaces/http/routes/health';

export function createServer() {
  const server = Fastify({ logger: { level: config.LOG_LEVEL } });
  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'auth-service',
    loggerLevel: config.LOG_LEVEL,
    shutdownTasks: [() => prisma.$disconnect()],
  });
  const repository = new PrismaAuthRepository(prisma);
  const passwordHasher = new ScryptPasswordHasher();
  const usersClient = new HttpUsersClient(config.USERS_SERVICE_URL);
  const controller = new AuthController(
    new RegisterAccountUseCase(
      usersClient,
      new RegisterCredentialsUseCase(repository, passwordHasher)
    ),
    new LoginUseCase(repository, passwordHasher),
    new RefreshSessionUseCase(repository, passwordHasher),
    new RevokeSessionUseCase(repository),
    new ValidateSessionUseCase(repository)
  );

  registerServiceMetrics(server, 'auth-service');

  registerHealthRoutes(server, {
    database: () => checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`),
    users: () => getHttpDependencyHealth(config.USERS_SERVICE_URL),
  });

  registerAuthRoutes(server, controller);

  return { server, shutdown };
}
