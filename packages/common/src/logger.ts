import pino from 'pino';

const REDACT_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'password',
  'secret',
  'token',
]);

function redactObject<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACT_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactObject(entry),
    ])
  ) as T;
}

export function createLogger(serviceName: string, level = process.env.LOG_LEVEL ?? 'info') {
  return pino({
    name: serviceName,
    level,
    base: { service: serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...REDACT_KEYS].map((key) => `headers.${key}`),
      censor: '[REDACTED]',
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        route: req.routeOptions?.url ?? req.routerPath ?? undefined,
        headers: redactObject(req.headers),
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
      err: (err) => ({
        type: err?.constructor?.name,
        message: err?.message,
        code: err && 'code' in err ? err.code : undefined,
        stack: err?.stack,
      }),
    },
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
