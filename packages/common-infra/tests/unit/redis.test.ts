import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  calls: [] as unknown[][],
  on: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class MockIORedis {
    constructor(...args: unknown[]) {
      redisMock.calls.push(args);
    }

    on(event: string, listener: (error: Error) => void) {
      redisMock.on(event, listener);
      return this;
    }
  },
}));

import { createRedisClient } from '../../src/redis';

describe('createRedisClient', () => {
  beforeEach(() => {
    redisMock.calls.length = 0;
    redisMock.on.mockReset();
  });

  it('bounds health-check requests and retries connections with capped backoff', () => {
    const logger = { error: vi.fn() };

    createRedisClient('redis://cache:6379', logger);

    expect(redisMock.calls[0]).toEqual([
      'redis://cache:6379',
      {
        connectTimeout: 5000,
        commandTimeout: 2000,
        maxRetriesPerRequest: 1,
        retryStrategy: expect.any(Function),
      },
    ]);

    const options = redisMock.calls[0]?.[1];
    if (
      typeof options !== 'object' ||
      options === null ||
      !('retryStrategy' in options) ||
      typeof options.retryStrategy !== 'function'
    ) {
      throw new Error('Expected Redis retry strategy to be configured');
    }
    expect(options?.retryStrategy(1)).toBe(100);
    expect(options?.retryStrategy(100)).toBe(2000);
  });

  it('logs connection errors through the supplied structured logger', () => {
    const logger = { error: vi.fn() };
    const error = new Error('Redis unavailable');

    createRedisClient('redis://cache:6379', logger);

    expect(redisMock.on).toHaveBeenCalledWith('error', expect.any(Function));
    const onError = redisMock.on.mock.calls[0]?.[1];
    if (typeof onError !== 'function') throw new Error('Expected Redis error handler');
    onError?.(error);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Redis error');
  });
});
