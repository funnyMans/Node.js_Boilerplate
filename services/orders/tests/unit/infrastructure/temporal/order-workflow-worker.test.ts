import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../../generated/prisma/client';

const temporalMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@temporalio/worker', () => ({
  NativeConnection: { connect: temporalMocks.connect },
  Worker: { create: temporalMocks.create },
}));

import { OrderWorkflowWorker } from '../../../../src/infrastructure/temporal/order-workflow-worker';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('OrderWorkflowWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a worker created during shutdown before requesting its shutdown', async () => {
    const sequence: string[] = [];
    const workerCreation = deferred<object>();
    const workerRun = deferred<void>();
    const connection = {
      close: vi.fn(async () => {
        sequence.push('connection-close');
      }),
    };
    const worker = {
      run: vi.fn(() => {
        sequence.push('run');
        return workerRun.promise;
      }),
      shutdown: vi.fn(() => {
        if (!sequence.includes('run')) throw new Error('Worker has not started');
        sequence.push('shutdown');
      }),
    };

    temporalMocks.connect.mockResolvedValue(connection);
    temporalMocks.create.mockReturnValue(workerCreation.promise);

    const service = new OrderWorkflowWorker(
      {} as PrismaClient,
      { error: vi.fn(), info: vi.fn() } as unknown as FastifyBaseLogger,
      {
        address: '127.0.0.1:7233',
        taskQueue: 'orders-fulfillment',
        paymentServiceUrl: 'http://payments:3010',
        inventoryServiceUrl: 'http://inventory:3011',
        serviceToServiceToken: 'local-development-service-token-please-change-32',
      },
      '/test/workflows.js'
    );

    service.start();
    await vi.waitFor(() => expect(temporalMocks.connect).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(temporalMocks.create).toHaveBeenCalledOnce());

    const stopping = service.stop();
    workerCreation.resolve(worker);
    await vi.waitFor(() => expect(worker.run).toHaveBeenCalledOnce());

    expect(sequence).toEqual(['run', 'shutdown']);
    expect(connection.close).not.toHaveBeenCalled();

    workerRun.resolve();
    await stopping;

    expect(sequence).toEqual(['run', 'shutdown', 'connection-close']);
  });
});
