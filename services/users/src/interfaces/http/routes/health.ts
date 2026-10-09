import type { FastifyInstance } from 'fastify';
import { buildHealthReport } from '@app/common';
import type prisma from '../../../infrastructure/database/prisma';
import { checkDatabaseHealth } from '../../../infrastructure/monitoring/health';

type HealthDependencies = {
  prisma: typeof prisma;
};

export function registerHealthRoutes(server: FastifyInstance, deps: HealthDependencies) {
  server.get('/health', async () => {
    const database = await checkDatabaseHealth(deps.prisma);
    return buildHealthReport('users', { database });
  });

  server.get('/ready', async (_request, reply) => {
    const database = await checkDatabaseHealth(deps.prisma);
    if (database === 'ok') return { ready: true };

    return reply.status(503).send({
      ready: false,
      details: { database },
    });
  });
}
