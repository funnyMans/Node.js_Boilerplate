import type { FastifyInstance } from 'fastify';
import { buildHealthReport, checkDependencyHealth } from '@app/common';
import type { PrismaClient } from '../../../../generated/prisma/client';

export function registerHealthRoutes(
  server: FastifyInstance,
  prisma: PrismaClient,
  getMessagingHealth: () => { nats: 'ok' | 'degraded'; temporal: 'ok' | 'degraded' }
) {
  server.get('/health', async () => {
    const database = await checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`);
    return buildHealthReport('orders-service', { database, ...getMessagingHealth() });
  });

  server.get('/ready', async (_request, reply) => {
    const database = await checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`);
    if (database === 'ok') {
      return { ready: true };
    }
    return reply.code(503).send({ ready: false, details: { database } });
  });
}
