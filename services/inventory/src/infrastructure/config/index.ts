import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

const localServiceToken = 'local-development-service-token-please-change-32';
export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@127.0.0.1:5432/inventory'),
  SERVICE_TO_SERVICE_TOKEN: z.string().min(32),
});

if (config.NODE_ENV === 'production' && config.SERVICE_TO_SERVICE_TOKEN === localServiceToken) {
  throw new Error('SERVICE_TO_SERVICE_TOKEN must be explicitly configured in production');
}
