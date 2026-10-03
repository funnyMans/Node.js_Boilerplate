import { z } from 'zod';

export type EnvSchema = Record<string, z.ZodTypeAny>;

export type ConfigFromSchema<TSchema extends EnvSchema> = z.infer<z.ZodObject<TSchema>>;

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
  const parsed = z.object(schema).safeParse(source);

  if (!parsed.success) {
    const issueMessages = parsed.error.issues.map((issue) => {
      const key = issue.path[0];
      return `Invalid environment variable "${String(key)}": ${issue.message}`;
    });
    throw new Error(issueMessages.join('\n'));
  }

  return parsed.data;
}
