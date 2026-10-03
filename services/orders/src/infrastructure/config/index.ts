import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

const localServiceToken = 'local-development-service-token-please-change-32';
export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.url().default('postgresql://dev:dev@127.0.0.1:5432/orders'),
  NATS_URL: z.string().default('nats://127.0.0.1:4222'),
  TEMPORAL_ADDRESS: z.string().default('127.0.0.1:7233'),
  TEMPORAL_TASK_QUEUE: z.string().default('orders-fulfillment'),
  PAYMENT_SERVICE_URL: z.string().url().default('http://127.0.0.1:3010'),
  INVENTORY_SERVICE_URL: z.string().url().default('http://127.0.0.1:3011'),
  SERVICE_TO_SERVICE_TOKEN: z.string().min(32),
  OUTBOX_RETENTION_DAYS: z.coerce.number().int().min(0).max(3650).default(0),
  S3_ENDPOINT_URL: z.url().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  RAW_EVENTS_BUCKET: z.string().min(1).default('raw'),
  S3_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  S3_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
});

if (config.NODE_ENV === 'production' && config.SERVICE_TO_SERVICE_TOKEN === localServiceToken) {
  throw new Error('SERVICE_TO_SERVICE_TOKEN must be explicitly configured in production');
}
