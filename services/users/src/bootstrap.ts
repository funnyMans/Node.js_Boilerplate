import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createLogger, createServiceBootstrap, registerServiceMetrics } from '@app/common';
import prisma from './infrastructure/database/prisma';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerUserRoutes } from './interfaces/http/routes/users';
import { config } from './infrastructure/config';

export function createServer(): {
  server: FastifyInstance;
  shutdown: () => Promise<void>;
} {
  const logger: FastifyBaseLogger = createLogger('users-service', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });

  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'users-service',
    shutdownTasks: [() => prisma.$disconnect()],
    observabilityEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  registerServiceMetrics(server, 'users-service');

  registerHealthRoutes(server, { prisma });
  registerUserRoutes(server, prisma);

  return { server, shutdown };
}
