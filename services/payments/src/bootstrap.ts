import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { createLogger, createServiceBootstrap, registerServiceMetrics } from '@app/common';
import { PaymentService } from './app/payment-service';
import { config, requireRuntimeSecrets } from './infrastructure/config';
import prisma from './infrastructure/database/prisma';
import { PrismaPaymentRepository } from './infrastructure/repositories/prisma-payment.repository';
import { StripePaymentAdapter } from './infrastructure/stripe-client';
import { LocalTestStripe } from './infrastructure/local-test-stripe';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerPaymentRoutes } from './interfaces/http/routes/payments';

export function createServer(): {
  server: FastifyInstance;
  shutdown: () => Promise<void>;
} {
  const logger: FastifyBaseLogger = createLogger('payments-service', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });

  const runtime = requireRuntimeSecrets();
  const stripePort = runtime.useFakeStripe
    ? new LocalTestStripe()
    : runtime.stripeSecretKey
      ? new StripePaymentAdapter(new Stripe(runtime.stripeSecretKey))
      : (() => {
          throw new Error('STRIPE_SECRET_KEY must be configured when fake Stripe is disabled');
        })();
  const repository = new PrismaPaymentRepository(prisma);
  const paymentService = new PaymentService(repository, stripePort);

  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'payments-service',
    shutdownTasks: [() => prisma.$disconnect()],
  });
  registerServiceMetrics(server, 'payments-service');

  server.addHook('onRequest', async (request, reply) => {
    const url = request.url;
    if (url === '/health' || url === '/ready' || url === '/metrics') return;

    const serviceToken = request.headers['x-service-token'];

    if (serviceToken === runtime.serviceToken) return;

    return reply.code(401).send({ error: 'Invalid service token' });
  });

  registerHealthRoutes(server, prisma);
  registerPaymentRoutes(server, paymentService);

  return { server, shutdown };
}
