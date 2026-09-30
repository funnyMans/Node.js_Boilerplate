import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

const localServiceToken = 'local-development-service-token-please-change-32';
export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  USERS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3001'),
  AUTH_SERVICE_URL: z.string().url().default('http://127.0.0.1:3002'),
  ORDERS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3003'),
  PAYMENTS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3010'),
  SERVICE_TO_SERVICE_TOKEN: z.string().min(32),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  NATS_URL: z.string().default('nats://127.0.0.1:4222'),
  TEMPORAL_ADDRESS: z.string().default('127.0.0.1:7233'),
});

if (config.NODE_ENV === 'production' && config.SERVICE_TO_SERVICE_TOKEN === localServiceToken) {
  throw new Error('SERVICE_TO_SERVICE_TOKEN must be explicitly configured in production');
}
