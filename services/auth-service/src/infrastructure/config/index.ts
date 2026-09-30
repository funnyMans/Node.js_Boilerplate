import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

const developmentTokenSecret = 'local-development-auth-token-secret-change-me-32';
export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  DATABASE_URL: z.string().url().default('postgresql://dev:dev@127.0.0.1:5432/auth'),
  USERS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3001'),
  AUTH_TOKEN_SECRET: z.string().min(32).default(developmentTokenSecret),
  LOG_LEVEL: z.string().default('info'),
});

if (config.NODE_ENV === 'production' && config.AUTH_TOKEN_SECRET === developmentTokenSecret) {
  throw new Error('AUTH_TOKEN_SECRET must be explicitly configured in production');
}
