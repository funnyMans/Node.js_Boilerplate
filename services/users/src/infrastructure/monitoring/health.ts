import { checkDependencyHealth } from '@app/common';
import type { PrismaClient } from '../../../generated/prisma/client';

export type DatabaseHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';
export type RedisHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

type RedisLike = {
  ping: () => Promise<string> | string;
};

export async function checkDatabaseHealth(
  prisma: Pick<PrismaClient, '$queryRaw'>
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
