import type { NatsConnection } from 'nats';

export type HealthStateValue = 'ok' | 'degraded' | 'down' | 'unknown';

export type TemporalHealthClient = {
  connection: {
    ensureConnected: () => Promise<void>;
  };
};

export type RedisHealthClient = {
  ping: () => Promise<string> | string;
};

export type NatsHealthClient = Pick<NatsConnection, 'isClosed' | 'isDraining'>;

export async function getRedisHealth(redis?: RedisHealthClient): Promise<HealthStateValue> {
  if (!redis) return 'unknown';

  try {
    const result = await redis.ping();
    return result === 'PONG' ? 'ok' : 'degraded';
  } catch {
    return 'down';
  }
}

export async function getNatsHealth(nc?: NatsHealthClient): Promise<HealthStateValue> {
  if (!nc) return 'unknown';

  try {
    if (nc.isClosed()) return 'down';
    if (nc.isDraining()) return 'degraded';
    return 'ok';
  } catch {
    return 'down';
  }
}

export async function getTemporalHealth(
  clientOrAddress?: TemporalHealthClient | string,
  maybeAddress?: string
): Promise<HealthStateValue> {
  if (!clientOrAddress && !maybeAddress && !process.env.TEMPORAL_ADDRESS) {
    return 'unknown';
  }

  if (clientOrAddress && typeof clientOrAddress === 'object') {
    try {
      await clientOrAddress.connection.ensureConnected();
      return 'ok';
    } catch {
      return 'down';
    }
  }

  try {
    const { Connection } = await import('@temporalio/client');
    const addr = clientOrAddress ?? maybeAddress ?? process.env.TEMPORAL_ADDRESS;
    if (!addr) return 'unknown';

    const conn = await Connection.connect({ address: addr });
    try {
      await conn.close();
    } catch {
      // Ignore shutdown cleanup errors during connectivity checks.
    }
    return 'ok';
  } catch {
    return 'down';
  }
}

type HealthCacheEntry = {
  expiresAt: number;
  result: Promise<HealthStateValue>;
};

function getCachedHealth(
  getEntry: () => HealthCacheEntry | undefined,
  setEntry: (entry: HealthCacheEntry) => void,
  ttl: number,
  check: () => Promise<HealthStateValue>
): Promise<HealthStateValue> {
  const now = Date.now();
  const cached = getEntry();
  if (cached && now < cached.expiresAt) return cached.result;

  const result = check();
  setEntry({ expiresAt: now + ttl, result });
  return result;
}

const temporalClientHealthCache = new WeakMap<object, HealthCacheEntry>();
const temporalAddressHealthCache = new Map<string, HealthCacheEntry>();
const redisHealthCache = new WeakMap<object, HealthCacheEntry>();
const natsHealthCache = new WeakMap<object, HealthCacheEntry>();

export async function getTemporalHealthCached(
  clientOrAddress?: TemporalHealthClient | string,
  maybeAddress?: string
): Promise<HealthStateValue> {
  const ttl = Number(process.env.TEMPORAL_HEALTH_TTL_MS ?? 5000);
  const target = clientOrAddress ?? maybeAddress ?? process.env.TEMPORAL_ADDRESS;
  if (!target) return getTemporalHealth();

  if (typeof target === 'string') {
    return getCachedHealth(
      () => temporalAddressHealthCache.get(target),
      (entry) => {
        const now = Date.now();
        for (const [address, cached] of temporalAddressHealthCache) {
          if (!(now < cached.expiresAt)) temporalAddressHealthCache.delete(address);
        }
        temporalAddressHealthCache.set(target, entry);
      },
      ttl,
      () => getTemporalHealth(target)
    );
  }

  return getCachedHealth(
    () => temporalClientHealthCache.get(target),
    (entry) => temporalClientHealthCache.set(target, entry),
    ttl,
    () => getTemporalHealth(target)
  );
}

export async function getRedisHealthCached(redis?: RedisHealthClient): Promise<HealthStateValue> {
  if (!redis) return getRedisHealth();

  const ttl = Number(process.env.REDIS_HEALTH_TTL_MS ?? 2000);
  return getCachedHealth(
    () => redisHealthCache.get(redis),
    (entry) => redisHealthCache.set(redis, entry),
    ttl,
    () => getRedisHealth(redis)
  );
}

export async function getNatsHealthCached(nc?: NatsHealthClient): Promise<HealthStateValue> {
  if (!nc) return getNatsHealth();

  const ttl = Number(process.env.NATS_HEALTH_TTL_MS ?? 2000);
  return getCachedHealth(
    () => natsHealthCache.get(nc),
    (entry) => natsHealthCache.set(nc, entry),
    ttl,
    () => getNatsHealth(nc)
  );
}
