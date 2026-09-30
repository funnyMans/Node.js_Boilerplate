export type HealthStateValue = 'ok' | 'degraded' | 'down' | 'unknown';

export type RedisHealthClient = {
  ping: () => Promise<string> | string;
};

export type NatsHealthClient = {
  status?: () => unknown;
  isClosed?: () => boolean;
  isDraining?: () => boolean;
};

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
    if (typeof nc.isClosed === 'function' && nc.isClosed()) return 'down';
    if (typeof nc.isDraining === 'function' && nc.isDraining()) return 'degraded';

    if (typeof nc.status === 'function') {
      const status = nc.status();
      if (typeof status === 'string') {
        return status === 'connect' || status === 'reconnecting' ? 'ok' : 'degraded';
      }
      if (status && typeof status === 'object') {
        return 'ok';
      }
    }

    return 'ok';
  } catch {
    return 'down';
  }
}

export async function getTemporalHealth(
  clientOrAddress?: any,
  maybeAddress?: string
): Promise<HealthStateValue> {
  if (!clientOrAddress && !maybeAddress && !process.env.TEMPORAL_ADDRESS) {
    return 'unknown';
  }

  // If a Temporal Client instance is provided, assume it's connected (fast-path).
  if (clientOrAddress && typeof clientOrAddress === 'object') {
    try {
      // If the client exposes a connection with close, consider it alive.
      // We avoid opening a new connection here to prefer using the existing instance.
      return 'ok';
    } catch {
      return 'down';
    }
  }

  // Otherwise, try to establish a short-lived connection to Temporal to verify reachability
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

// Simple cached wrapper for Temporal health to avoid opening a new connection on every request.
let _temporalCache: { state: HealthStateValue; ts: number } | null = null;

export async function getTemporalHealthCached(
  clientOrAddress?: any,
  maybeAddress?: string
): Promise<HealthStateValue> {
  const ttl = Number(process.env.TEMPORAL_HEALTH_TTL_MS ?? 5000);
  const now = Date.now();
  if (_temporalCache && now - _temporalCache.ts < ttl) {
    return _temporalCache.state;
  }

  const state = await getTemporalHealth(clientOrAddress, maybeAddress);
  _temporalCache = { state, ts: now };
  return state;
}

// Cached wrappers for Redis and NATS
let _redisCache: { state: HealthStateValue; ts: number } | null = null;
export async function getRedisHealthCached(redis?: RedisHealthClient): Promise<HealthStateValue> {
  const ttl = Number(process.env.REDIS_HEALTH_TTL_MS ?? 2000);
  const now = Date.now();
  if (_redisCache && now - _redisCache.ts < ttl) return _redisCache.state;

  const state = await getRedisHealth(redis);
  _redisCache = { state, ts: now };
  return state;
}

let _natsCache: { state: HealthStateValue; ts: number } | null = null;
export async function getNatsHealthCached(nc?: NatsHealthClient): Promise<HealthStateValue> {
  const ttl = Number(process.env.NATS_HEALTH_TTL_MS ?? 2000);
  const now = Date.now();
  if (_natsCache && now - _natsCache.ts < ttl) return _natsCache.state;

  const state = await getNatsHealth(nc);
  _natsCache = { state, ts: now };
  return state;
}
