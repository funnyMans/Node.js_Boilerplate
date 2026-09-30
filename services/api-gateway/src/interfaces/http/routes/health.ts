import type { FastifyInstance } from 'fastify';
import {
  buildHealthReport,
  getHttpDependencyHealth,
  getHttpDependencyReadiness,
} from '@app/common';
import { isGatewayReady } from '../../../infrastructure/monitoring/health';
import type {
  HealthStateValue,
  NatsHealthClient,
  RedisHealthClient,
} from '@nodejs-boilerplate/common-infra';

type HealthDependencies = {
  redis: RedisHealthClient;
  getNatsClient: () => Promise<NatsHealthClient | undefined>;
  temporalAddress: string;
  usersServiceUrl: string;
  ordersServiceUrl: string;
  authServiceUrl: string;
  paymentsServiceUrl: string;
  getRedisHealth: (redis: RedisHealthClient) => Promise<HealthStateValue>;
  getNatsHealth: (natsClient: NatsHealthClient | undefined) => Promise<HealthStateValue>;
  getTemporalHealth: (client: undefined, address: string) => Promise<HealthStateValue>;
};

export function registerHealthRoutes(server: FastifyInstance, deps: HealthDependencies) {
  server.get('/health', async () => {
    const resolvedNats = await deps.getNatsClient();
    const users = await getHttpDependencyHealth(deps.usersServiceUrl);
    const orders = await getHttpDependencyHealth(deps.ordersServiceUrl);
    const auth = await getHttpDependencyHealth(deps.authServiceUrl);
    const payments = await getHttpDependencyHealth(deps.paymentsServiceUrl);
    const redisState = await deps.getRedisHealth(deps.redis);
    const natsState = await deps.getNatsHealth(resolvedNats);
    const temporalState = await deps.getTemporalHealth(undefined, deps.temporalAddress);

    return buildHealthReport('api-gateway', {
      users,
      orders,
      auth,
      payments,
      redis: redisState,
      nats: natsState,
      temporal: temporalState,
    });
  });

  server.get('/ready', async (_req, reply) => {
    const [usersReady, ordersReady, authReady, paymentsReady] = await Promise.all([
      getHttpDependencyReadiness(deps.usersServiceUrl),
      getHttpDependencyReadiness(deps.ordersServiceUrl),
      getHttpDependencyReadiness(deps.authServiceUrl),
      getHttpDependencyReadiness(deps.paymentsServiceUrl),
    ]);

    const resolvedNats = await deps.getNatsClient();
    const redisState = await deps.getRedisHealth(deps.redis);
    const natsState = await deps.getNatsHealth(resolvedNats);
    const temporalState = await deps.getTemporalHealth(undefined, deps.temporalAddress);

    const ready = isGatewayReady({
      users: usersReady,
      orders: ordersReady,
      auth: authReady,
      payments: paymentsReady,
      redis: redisState,
      nats: natsState,
      temporal: temporalState,
    });

    if (ready) return { ready: true };

    return reply.status(503).send({
      ready: false,
      details: {
        users: usersReady,
        orders: ordersReady,
        auth: authReady,
        payments: paymentsReady,
        redis: redisState,
        nats: natsState,
        temporal: temporalState,
      },
    });
  });
}
