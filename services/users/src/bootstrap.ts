import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { createLogger, createServiceBootstrap, registerServiceMetrics } from '@app/common';
import { createRedisClient } from '@nodejs-boilerplate/common-infra';
import prisma from './infrastructure/database/prisma';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerUserRoutes } from './interfaces/http/routes/users';
import { config } from './infrastructure/config';

export function createServer(): {
  server: FastifyInstance;
  redis: ReturnType<typeof createRedisClient>;
  shutdown: () => Promise<void>;
} {
  const logger: FastifyBaseLogger = createLogger('users-service', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });

  const redis = createRedisClient(config.REDIS_URL, server.log);
  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'users-service',
    shutdownTasks: [
      () => {
        server.log.info({ redisStatus: redis.status }, 'closing Redis connection');
        redis.disconnect();
        server.log.info('Redis connection closed');
      },
      async () => {
        server.log.info('disconnecting users database');
        await prisma.$disconnect();
        server.log.info('users database disconnected');
      },
    ],
    observabilityEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  registerServiceMetrics(server, 'users-service');

  registerHealthRoutes(server, { prisma, redis });
  registerUserRoutes(server, prisma);

  return { server, redis, shutdown };
}
