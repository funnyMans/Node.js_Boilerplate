import type { FastifyInstance } from 'fastify';
import { buildHealthReport, type DependencyStatus } from '@app/common';

type HealthDependencies = {
  database: () => Promise<'ok' | 'down'>;
  users: () => Promise<DependencyStatus>;
};

export function registerHealthRoutes(server: FastifyInstance, deps: HealthDependencies): void {
  server.get('/health', async () => {
    const database = await deps.database();
    const users = await deps.users();
    return buildHealthReport('auth-service', { database, users });
  });

  server.get('/ready', async (_request, reply) => {
    const database = await deps.database();
    const users = await deps.users();
    if (database === 'ok' && users === 'ok') return { ready: true };

    return reply.status(503).send({
      ready: false,
      details: { database, users },
    });
  });
}
