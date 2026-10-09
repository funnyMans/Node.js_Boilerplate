import type { FastifyInstance } from 'fastify';
import {
  buildHealthReport,
  getHttpDependencyHealth,
  getHttpDependencyReadiness,
} from '@app/common';
import { isGatewayReady } from '../../../infrastructure/monitoring/health';

type HealthDependencies = {
  usersServiceUrl: string;
  authServiceUrl: string;
};

export function registerHealthRoutes(server: FastifyInstance, deps: HealthDependencies) {
  server.get('/health', async () => {
    const [users, auth] = await Promise.all([
      getHttpDependencyHealth(deps.usersServiceUrl),
      getHttpDependencyHealth(deps.authServiceUrl),
    ]);

    return buildHealthReport('api-gateway', { users, auth });
  });

  server.get('/ready', async (_request, reply) => {
    const [users, auth] = await Promise.all([
      getHttpDependencyReadiness(deps.usersServiceUrl),
      getHttpDependencyReadiness(deps.authServiceUrl),
    ]);

    if (isGatewayReady({ users, auth })) return { ready: true };

    return reply.status(503).send({
      ready: false,
      details: { users, auth },
    });
  });
}
