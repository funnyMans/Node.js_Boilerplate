import { describe, expect, it } from 'vitest';
import {
  checkDatabaseHealth,
  checkRedisHealth,
} from '../../../../src/infrastructure/monitoring/health';

describe('users dependency health', () => {
  it('returns ok when the database responds', async () => {
    const status = await checkDatabaseHealth({
      $queryRaw: async () => [{ ok: 1 }],
    });

    expect(status).toBe('ok');
  });

  it('returns down when the database throws', async () => {
    const status = await checkDatabaseHealth({
      $queryRaw: async () => {
        throw new Error('db unavailable');
      },
    });

    expect(status).toBe('down');
  });

  it('returns ok when redis responds to ping', async () => {
    const status = await checkRedisHealth({
      ping: async () => 'PONG',
    });

    expect(status).toBe('ok');
  });

  it('returns down when redis throws', async () => {
    const status = await checkRedisHealth({
      ping: async () => {
        throw new Error('redis unavailable');
      },
    });

    expect(status).toBe('down');
  });
});
