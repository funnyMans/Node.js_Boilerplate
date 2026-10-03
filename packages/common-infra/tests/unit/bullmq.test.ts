import { beforeEach, describe, expect, it, vi } from 'vitest';

const constructors = vi.hoisted(() => ({
  queue: vi.fn(),
  worker: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Queue: constructors.queue,
  Worker: constructors.worker,
}));

import { createQueue, createWorker } from '../../src/bullmq';

describe('BullMQ factories', () => {
  beforeEach(() => {
    constructors.queue.mockClear();
    constructors.worker.mockClear();
  });

  it('passes Redis URLs using BullMQ connection options', () => {
    createQueue('jobs', { connectionUrl: 'redis://queue:6379' });

    expect(constructors.queue).toHaveBeenCalledWith('jobs', {
      connection: { url: 'redis://queue:6379' },
    });
  });

  it('configures workers to retry Redis commands indefinitely by default', () => {
    const processor = async (job: { data: string }) => job.data;
    createWorker('jobs', processor, {
      connectionUrl: 'redis://worker:6379',
      concurrency: 4,
    });

    expect(constructors.worker).toHaveBeenCalledWith('jobs', processor, {
      concurrency: 4,
      connection: {
        url: 'redis://worker:6379',
        maxRetriesPerRequest: null,
      },
    });
  });
});
