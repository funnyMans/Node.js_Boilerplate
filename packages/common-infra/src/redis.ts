import IORedis from 'ioredis';

export function createRedisClient(url?: string) {
  const redis = new IORedis(url ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  // Basic error logging
  redis.on('error', (err) => console.error('Redis error', err));
  return redis;
}

export type RedisClient = ReturnType<typeof createRedisClient>;
