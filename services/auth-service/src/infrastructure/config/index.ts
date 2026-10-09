import 'dotenv/config';
import { z } from 'zod';
import { createConfig } from '@app/common';

const developmentAccessSecret = 'local-development-access-secret-change-me-32';
const developmentRefreshSecret = 'local-development-refresh-secret-change-me-32';
const developmentHashSecret = 'local-development-hash-secret-change-me-32';
export const config = createConfig({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  DATABASE_URL: z.string().url().default('postgresql://dev:dev@127.0.0.1:5432/auth'),
  USERS_SERVICE_URL: z.string().url().default('http://127.0.0.1:3001'),
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32).default(developmentAccessSecret),
  AUTH_REFRESH_TOKEN_SECRET: z.string().min(32).default(developmentRefreshSecret),
  AUTH_TOKEN_HASH_SECRET: z.string().min(32).default(developmentHashSecret),
  AUTH_ACCESS_TOKEN_LIFETIME_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_LIFETIME_SECONDS: z.coerce.number().int().positive().default(2592000),
  LOG_LEVEL: z.string().default('info'),
});

if (
  config.NODE_ENV === 'production' &&
  [
    ['AUTH_ACCESS_TOKEN_SECRET', config.AUTH_ACCESS_TOKEN_SECRET, developmentAccessSecret],
    ['AUTH_REFRESH_TOKEN_SECRET', config.AUTH_REFRESH_TOKEN_SECRET, developmentRefreshSecret],
    ['AUTH_TOKEN_HASH_SECRET', config.AUTH_TOKEN_HASH_SECRET, developmentHashSecret],
  ].some(([, actual, development]) => actual === development)
) {
  throw new Error(
    'Production auth signing and token hashing secrets must be explicitly configured'
  );
}
