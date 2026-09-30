import { Queue, Worker, WorkerOptions } from 'bullmq';

export function createQueue(name: string, opts?: { connectionUrl?: string }) {
  const connection = opts?.connectionUrl ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const queue = new Queue(name, { connection: connection as any });
  return queue;
}

export function createWorker(
  name: string,
  processor: (job: any) => Promise<any>,
  opts?: WorkerOptions
) {
  const connection = (opts as any)?.connection ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  return new Worker(name, async (job) => processor(job), {
    connection: connection as any,
    ...(opts || {}),
  });
}
