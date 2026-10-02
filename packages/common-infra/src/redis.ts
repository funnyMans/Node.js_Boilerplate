import IORedis from 'ioredis';

export interface InfrastructureLogger {
  error: (obj: { err: Error; subject?: string }, message: string) => void;
}

export function createRedisClient(url: string | undefined, logger: InfrastructureLogger) {
  const redis = new IORedis(url ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  redis.on('error', (err) => logger.error({ err }, 'Redis error'));
  return redis;
}

export type RedisClient = ReturnType<typeof createRedisClient>;
