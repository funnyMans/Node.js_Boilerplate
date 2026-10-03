import { checkDependencyHealth } from '@app/common';

export type DatabaseHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';
export type RedisHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

type RedisLike = {
  ping: () => Promise<string> | string;
};

type DatabaseHealthClient = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function checkDatabaseHealth(
  prisma: DatabaseHealthClient
): Promise<DatabaseHealthStatus> {
  return checkDependencyHealth(() => prisma.$queryRaw`SELECT 1`);
}

export async function checkRedisHealth(redis?: RedisLike): Promise<RedisHealthStatus> {
  if (!redis) return 'unknown';

  try {
    const result = await redis.ping();
    return result === 'PONG' ? 'ok' : 'degraded';
  } catch {
    return 'down';
  }
}
