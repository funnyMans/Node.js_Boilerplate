import { z } from 'zod';

export type EnvSchema = Record<string, z.ZodTypeAny>;

export type ConfigFromSchema<TSchema extends EnvSchema> = {
  [K in keyof TSchema]: z.infer<TSchema[K]>;
};

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || value.trim() === '') return fallback;

  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;

  return parsed;
}

export function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value || value.trim() === '') return fallback;

  return value === 'true' || value === '1';
}

export function createConfig<TSchema extends EnvSchema>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env
): ConfigFromSchema<TSchema> {
  const output = {} as ConfigFromSchema<TSchema>;

  for (const [key, valueSchema] of Object.entries(schema)) {
    const rawValue = source[key];
    const parsed = valueSchema.safeParse(rawValue);

    if (!parsed.success) {
      const issueText = parsed.error.issues.map((issue) => issue.message).join('; ');

      throw new Error(`Invalid environment variable "${key}": ${issueText}`);
    }

    output[key as keyof TSchema] = parsed.data as ConfigFromSchema<TSchema>[keyof TSchema];
  }

  return output;
}
