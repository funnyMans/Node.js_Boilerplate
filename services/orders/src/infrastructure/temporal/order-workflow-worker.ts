import { NativeConnection, Worker } from '@temporalio/worker';
import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createOrderFulfillmentActivities } from './order-fulfillment.activities';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OrderWorkflowWorker {
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private worker: Worker | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
    private readonly options: {
      address: string;
      taskQueue: string;
      paymentServiceUrl: string;
      inventoryServiceUrl: string;
      serviceToServiceToken: string;
    },
    private readonly workflowBundlePath = require.resolve('../../workflows')
  ) {}

  start(): void {
    if (this.loopPromise) throw new Error('Order workflow worker has already been started');
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.worker?.shutdown();
    await this.loopPromise;
  }

  isConnected(): boolean {
    return this.worker !== undefined;
  }

  private async run(): Promise<void> {
    while (this.running) {
      let connection: NativeConnection | undefined;
      try {
        connection = await NativeConnection.connect({ address: this.options.address });
        const worker = await Worker.create({
          connection,
          taskQueue: this.options.taskQueue,
          workflowsPath: this.workflowBundlePath,
          activities: createOrderFulfillmentActivities({
            prisma: this.prisma,
            paymentServiceUrl: this.options.paymentServiceUrl,
            inventoryServiceUrl: this.options.inventoryServiceUrl,
            serviceToServiceToken: this.options.serviceToServiceToken,
            fetch: globalThis.fetch,
            logger: this.logger,
          }),
        });
        this.worker = worker;
        const workerRun = worker.run();
        if (!this.running) worker.shutdown();
        if (this.running) {
          this.logger.info({ taskQueue: this.options.taskQueue }, 'Temporal order worker started');
        }
        await workerRun;
      } catch (error) {
        if (this.running) this.logger.error({ err: error }, 'Temporal order worker stopped');
      } finally {
        this.worker = undefined;
        if (connection) {
          await connection.close().catch((error: unknown) => {
            this.logger.error({ err: error }, 'Temporal worker connection close failed');
          });
        }
      }
      if (this.running) await wait(1000);
    }
  }
}
