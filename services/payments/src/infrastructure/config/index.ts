import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.url().default('postgresql://postgres:postgres@127.0.0.1:5432/payments'),
  STRIPE_SECRET_KEY: z.string().optional(),
  PAYMENTS_FAKE_STRIPE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SERVICE_TO_SERVICE_TOKEN: z.string().min(32).optional(),
});

export const config = configSchema.parse(process.env);
const localServiceToken = 'local-development-service-token-please-change-32';

export function requireRuntimeSecrets() {
  if (!config.SERVICE_TO_SERVICE_TOKEN) {
    throw new Error('SERVICE_TO_SERVICE_TOKEN must be configured');
  }
  if (config.PAYMENTS_FAKE_STRIPE && config.NODE_ENV === 'production') {
    throw new Error('PAYMENTS_FAKE_STRIPE cannot be enabled in production');
  }
  if (config.NODE_ENV === 'production' && config.SERVICE_TO_SERVICE_TOKEN === localServiceToken) {
    throw new Error('SERVICE_TO_SERVICE_TOKEN must be explicitly configured in production');
  }
  if (!config.PAYMENTS_FAKE_STRIPE && !config.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY must be configured');
  }
  return {
    serviceToken: config.SERVICE_TO_SERVICE_TOKEN,
    stripeSecretKey: config.STRIPE_SECRET_KEY,
    useFakeStripe: config.PAYMENTS_FAKE_STRIPE,
  };
}
