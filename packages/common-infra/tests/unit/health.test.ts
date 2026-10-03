import { describe, expect, it, vi } from 'vitest';
import {
  getNatsHealth,
  getNatsHealthCached,
  getRedisHealth,
  getRedisHealthCached,
  getTemporalHealth,
} from '../../src/health';

describe('common-infra health helpers', () => {
  it('checks Redis readiness', async () => {
    const redis = {
      ping: async () => 'PONG',
    };

    await expect(getRedisHealth(redis)).resolves.toBe('ok');
  });

  it('checks NATS readiness from connection state', async () => {
    const nc = {
      isClosed: () => false,
      isDraining: () => false,
    };

    await expect(getNatsHealth(nc)).resolves.toBe('ok');
  });

  it('marks a closed NATS connection down', async () => {
    await expect(getNatsHealth({ isClosed: () => true, isDraining: () => false })).resolves.toBe(
      'down'
    );
  });

  it('marks a draining NATS connection degraded', async () => {
    await expect(getNatsHealth({ isClosed: () => false, isDraining: () => true })).resolves.toBe(
      'degraded'
    );
  });

  it('marks missing temporal client as unknown', async () => {
    await expect(getTemporalHealth()).resolves.toBe('unknown');
  });

  it('checks connectivity through an existing Temporal client', async () => {
    const ensureConnected = vi.fn().mockResolvedValue(undefined);

    await expect(getTemporalHealth({ connection: { ensureConnected } })).resolves.toBe('ok');
    expect(ensureConnected).toHaveBeenCalledOnce();
  });

  it('marks an existing Temporal client down when connectivity fails', async () => {
    const ensureConnected = vi.fn().mockRejectedValue(new Error('Temporal unavailable'));

    await expect(getTemporalHealth({ connection: { ensureConnected } })).resolves.toBe('down');
  });

  it('keeps cached Redis health isolated per client', async () => {
    const healthyRedis = { ping: async () => 'PONG' };
    const unavailableRedis = {
      ping: async () => {
        throw new Error('redis unavailable');
      },
    };

    await expect(getRedisHealthCached(healthyRedis)).resolves.toBe('ok');
    await expect(getRedisHealthCached(unavailableRedis)).resolves.toBe('down');
  });

  it('keeps cached NATS health isolated per connection', async () => {
    const healthyNats = { isClosed: () => false, isDraining: () => false };
    const closedNats = { isClosed: () => true, isDraining: () => false };

    await expect(getNatsHealthCached(healthyNats)).resolves.toBe('ok');
    await expect(getNatsHealthCached(closedNats)).resolves.toBe('down');
  });
});
