import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  USERS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3001'),
  AUTH_SERVICE_URL: z.string().url().default('http://127.0.0.1:3002'),
});
