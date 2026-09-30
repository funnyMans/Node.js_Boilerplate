import { describe, expect, it } from 'vitest';
import { getNatsHealth, getRedisHealth, getTemporalHealth } from '../../src/health';

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
      status: () => ({ inflight: 0, done: false }),
    };

    await expect(getNatsHealth(nc)).resolves.toBe('ok');
  });

  it('marks missing temporal client as unknown', async () => {
    await expect(getTemporalHealth()).resolves.toBe('unknown');
  });
});
