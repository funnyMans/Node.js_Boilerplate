import type { FastifyInstance } from 'fastify';
import { buildHealthReport } from '@app/common';
import type prisma from '../../../infrastructure/database/prisma';
import { checkDatabaseHealth, checkRedisHealth } from '../../../infrastructure/monitoring/health';

type HealthDependencies = {
  prisma: typeof prisma;
  redis: { ping: () => Promise<string> | string } | undefined;
};

export function registerHealthRoutes(server: FastifyInstance, deps: HealthDependencies) {
  server.get('/health', async () => {
    const database = await checkDatabaseHealth(deps.prisma);
    const redisState = await checkRedisHealth(deps.redis);

    return buildHealthReport('users', {
      database,
      redis: redisState,
    });
  });

  server.get('/ready', async (_request, reply) => {
    const database = await checkDatabaseHealth(deps.prisma);
    const redisState = await checkRedisHealth(deps.redis);

    const ready = database === 'ok' && redisState === 'ok';
    if (ready) return { ready: true };

    return reply.status(503).send({
      ready: false,
      details: { database, redis: redisState },
    });
  });
}
