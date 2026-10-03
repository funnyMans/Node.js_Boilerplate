import Fastify from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import { S3Client } from '@aws-sdk/client-s3';
import { createLogger, createServiceBootstrap, registerServiceMetrics } from '@app/common';
import { createNatsClient } from '@nodejs-boilerplate/common-infra';
import { OrdersService } from './app/orders.service';
import { config } from './infrastructure/config';
import prisma from './infrastructure/database/prisma';
import { OutboxPublisher } from './infrastructure/messaging/outbox-publisher';
import { OutboxRawExporter } from './infrastructure/messaging/outbox-raw-exporter';
import { OrderWorkflowDispatcher } from './infrastructure/temporal/order-workflow-dispatcher';
import { OrderWorkflowWorker } from './infrastructure/temporal/order-workflow-worker';
import { registerHealthRoutes } from './interfaces/http/routes/health';
import { registerOrderRoutes } from './interfaces/http/routes/orders';
import { registerOutboxMetrics } from './infrastructure/metrics/outbox-metrics';

export function createServer() {
  const logger: FastifyBaseLogger = createLogger('orders-service', config.LOG_LEVEL);
  const server = Fastify({ loggerInstance: logger });
  const outboxPublisher = new OutboxPublisher(
    prisma,
    server.log,
    () => createNatsClient(config.NATS_URL, server.log),
    1000,
    config.OUTBOX_RETENTION_DAYS
  );
  if (Boolean(config.AWS_ACCESS_KEY_ID) !== Boolean(config.AWS_SECRET_ACCESS_KEY)) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together');
  }
  const s3Client = new S3Client({
    region: config.AWS_REGION,
    retryMode: 'standard',
    maxAttempts: config.S3_MAX_ATTEMPTS,
    ...(config.S3_ENDPOINT_URL ? { endpoint: config.S3_ENDPOINT_URL, forcePathStyle: true } : {}),
    ...(config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: config.AWS_ACCESS_KEY_ID,
            secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  const outboxRawExporter = new OutboxRawExporter(
    prisma,
    server.log,
    s3Client,
    config.RAW_EVENTS_BUCKET,
    1000,
    config.S3_REQUEST_TIMEOUT_MS
  );
  const temporalOptions = {
    address: config.TEMPORAL_ADDRESS,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    paymentServiceUrl: config.PAYMENT_SERVICE_URL,
    inventoryServiceUrl: config.INVENTORY_SERVICE_URL,
    serviceToServiceToken: config.SERVICE_TO_SERVICE_TOKEN,
  };
  const workflowDispatcher = new OrderWorkflowDispatcher(
    prisma,
    server.log,
    temporalOptions.address,
    temporalOptions.taskQueue
  );
  const workflowWorker = new OrderWorkflowWorker(prisma, server.log, temporalOptions);

  const { shutdown } = createServiceBootstrap(server, {
    serviceName: 'orders-service',
    shutdownTasks: [
      () => outboxPublisher.stop(),
      () => outboxRawExporter.stop(),
      () => workflowDispatcher.stop(),
      () => workflowWorker.stop(),
      () => prisma.$disconnect(),
    ],
    observabilityEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  server.addHook('onReady', async () => {
    outboxPublisher.start();
    outboxRawExporter.start();
    workflowDispatcher.start();
    workflowWorker.start();
  });

  const { registry } = registerServiceMetrics(server, 'orders-service');
  registerOutboxMetrics(prisma, registry);

  registerHealthRoutes(server, prisma, () => ({
    nats: outboxPublisher.isConnected() ? 'ok' : 'degraded',
    temporal: workflowDispatcher.isConnected() && workflowWorker.isConnected() ? 'ok' : 'degraded',
  }));
  registerOrderRoutes(server, new OrdersService(prisma));

  return { server, shutdown };
}
