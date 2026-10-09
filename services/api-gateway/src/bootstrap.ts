import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createLogger, createServiceBootstrap, registerServiceMetrics } from '@app/common';
import { config } from './infrastructure/config';
import { HttpAuthClient } from './infrastructure/clients/http-auth.client';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerAuthRoutes } from './interfaces/http/routes/auth';
import { registerUserRoutes } from './interfaces/http/routes/users';

export function createServer(): {
  server: FastifyInstance;
  shutdown: () => Promise<void>;
} {
  const logger: FastifyBaseLogger = createLogger('api-gateway', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });

  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'api-gateway',
    observabilityEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  registerHealthRoutes(server, {
    usersServiceUrl: config.USERS_SERVICE_URL,
    authServiceUrl: config.AUTH_SERVICE_URL,
  });

  registerServiceMetrics(server, 'api-gateway');

  const authClient = new HttpAuthClient(config.AUTH_SERVICE_URL);
  registerAuthRoutes(server, config.AUTH_SERVICE_URL);
  registerUserRoutes(server, config.USERS_SERVICE_URL, authClient);

  return { server, shutdown };
}
