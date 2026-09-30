import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createServiceBootstrap, registerServiceMetrics } from '@app/common';
import {
  createRedisClient,
  createNatsClient,
  getRedisHealthCached,
  getNatsHealthCached,
  getTemporalHealthCached,
} from '@nodejs-boilerplate/common-infra';
import { config } from './infrastructure/config';
import { HttpAuthClient } from './infrastructure/clients/http-auth.client';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerAuthRoutes } from './interfaces/http/routes/auth';
import { registerOrderRoutes } from './interfaces/http/routes/orders';
import { registerPaymentMethodRoutes } from './interfaces/http/routes/payments';
import { registerUserRoutes } from './interfaces/http/routes/users';

export function createServer(): {
  server: FastifyInstance;
  shutdown: () => Promise<void>;
} {
  const server = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(process.env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard' },
            },
          }
        : {}),
    },
  });

  const redis = createRedisClient(config.REDIS_URL);
  type NatsClient = Awaited<ReturnType<typeof createNatsClient>>;
  let natsClient: NatsClient | undefined;
  let natsConnectionPromise: Promise<NatsClient | undefined> | undefined;
  let natsConnectionWarningLogged = false;
  const getNatsClient = (): Promise<NatsClient | undefined> => {
    if (natsClient) return Promise.resolve(natsClient);
    if (natsConnectionPromise) return natsConnectionPromise;

    const connectionAttempt = createNatsClient(config.NATS_URL)
      .then((connection) => {
        natsClient = connection;
        natsConnectionWarningLogged = false;
        return connection;
      })
      .catch((error: unknown) => {
        if (!natsConnectionWarningLogged) {
          server.log.warn(
            { err: error },
            'NATS connection unavailable; gateway health checks will retry'
          );
          natsConnectionWarningLogged = true;
        }
        return undefined;
      })
      .finally(() => {
        if (natsConnectionPromise === connectionAttempt) natsConnectionPromise = undefined;
      });
    natsConnectionPromise = connectionAttempt;
    return connectionAttempt;
  };
  void getNatsClient();

  const { shutdown } = createServiceBootstrap(server as any, {
    serviceName: 'api-gateway',
    loggerLevel: config.LOG_LEVEL,
    shutdownTasks: [
      () => redis.quit(),
      async () => {
        const connection = natsClient ?? (await natsConnectionPromise);
        if (connection) await connection.close();
      },
    ],
    observabilityEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  registerHealthRoutes(server, {
    redis,
    getNatsClient,
    temporalAddress: config.TEMPORAL_ADDRESS,
    usersServiceUrl: config.USERS_SERVICE_URL,
    ordersServiceUrl: config.ORDERS_SERVICE_URL,
    authServiceUrl: config.AUTH_SERVICE_URL,
    paymentsServiceUrl: config.PAYMENTS_SERVICE_URL,
    getRedisHealth: getRedisHealthCached,
    getNatsHealth: getNatsHealthCached,
    getTemporalHealth: getTemporalHealthCached,
  });

  registerServiceMetrics(server, 'api-gateway');

  const authClient = new HttpAuthClient(config.AUTH_SERVICE_URL);
  registerAuthRoutes(server, config.AUTH_SERVICE_URL);
  registerOrderRoutes(server, config.ORDERS_SERVICE_URL, authClient);
  registerPaymentMethodRoutes(
    server,
    config.PAYMENTS_SERVICE_URL,
    authClient,
    config.SERVICE_TO_SERVICE_TOKEN
  );
  registerUserRoutes(server, config.USERS_SERVICE_URL, authClient);

  return { server, shutdown };
}
