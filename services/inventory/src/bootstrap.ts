import Fastify from 'fastify';
import { createServiceBootstrap, registerServiceMetrics } from '@app/common';
import { InventoryService } from './app/inventory.service';
import { config } from './infrastructure/config';
import prisma from './infrastructure/database/prisma';
import { PrismaInventoryRepository } from './infrastructure/repositories/prisma-inventory.repository';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerInventoryRoutes } from './interfaces/http/routes/inventory';

export function createServer() {
  const server = Fastify({
    logger: { level: config.LOG_LEVEL },
  });
  const service = new InventoryService(new PrismaInventoryRepository(prisma));
  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'inventory-service',
    loggerLevel: config.LOG_LEVEL,
    shutdownTasks: [() => prisma.$disconnect()],
  });
  registerServiceMetrics(server, 'inventory-service');

  server.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url === '/ready' || request.url === '/metrics') {
      return;
    }
    if (request.headers['x-service-token'] !== config.SERVICE_TO_SERVICE_TOKEN) {
      return reply.code(401).send({ error: 'Invalid service token' });
    }
  });
  registerHealthRoutes(server, prisma);
  registerInventoryRoutes(server, service);
  return { server, shutdown };
}
