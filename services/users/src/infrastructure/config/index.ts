import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.url().default('postgresql://dev:dev@127.0.0.1:5432/app'),
  REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
});
