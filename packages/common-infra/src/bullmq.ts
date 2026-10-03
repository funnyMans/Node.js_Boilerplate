import { Queue, Worker } from 'bullmq';
import type { Processor, QueueOptions, WorkerOptions } from 'bullmq';

export function createQueue(name: string, opts?: { connectionUrl?: string }) {
  const url = opts?.connectionUrl ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const options: QueueOptions = { connection: { url } };
  return new Queue(name, options);
}

type WorkerFactoryOptions = Omit<WorkerOptions, 'connection'> & {
  connection?: WorkerOptions['connection'];
  connectionUrl?: string;
};

export function createWorker<Data = unknown, Result = unknown, Name extends string = string>(
  name: string,
  processor: Processor<Data, Result, Name>,
  opts?: WorkerFactoryOptions
) {
  const { connection: configuredConnection, connectionUrl, ...workerOptions } = opts ?? {};
  const url = connectionUrl ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

  return new Worker<Data, Result, Name>(name, processor, {
    ...workerOptions,
    connection: configuredConnection ?? { url, maxRetriesPerRequest: null },
  });
}
