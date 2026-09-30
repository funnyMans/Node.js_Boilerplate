import { Connection, WorkflowExecutionAlreadyStartedError, Client } from '@temporalio/client';
import { WorkflowIdReusePolicy } from '@temporalio/common';
import { trace } from '@opentelemetry/api';
import type { FastifyBaseLogger } from 'fastify';
import { createTraceContext, runWithTraceSpan } from '@app/common';
import type { TraceContextCarrier } from '@app/common';
import type { OrderCreatedEvent } from '@app/contracts';
import type { PrismaClient } from '../../../generated/prisma/client';
import type { OrderFulfillmentInput } from '../../workflows/order-fulfillment.types';

const BATCH_SIZE = 25;
const LOCK_DURATION_MS = 30_000;
const MAX_DELIVERY_ATTEMPTS = 10;

type DispatchableEvent = {
  id: string;
  payload: OrderCreatedEvent;
  traceContext: TraceContextCarrier | null;
  workflowAttempts: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OrderWorkflowDispatcher {
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private connection: Connection | undefined;
  private client: Client | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
    private readonly address: string,
    private readonly taskQueue: string,
    private readonly pollIntervalMs = 1000
  ) {}

  start(): void {
    if (this.loopPromise) throw new Error('Order workflow dispatcher has already been started');
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise;
    await this.connection?.close();
    this.connection = undefined;
    this.client = undefined;
  }

  isConnected(): boolean {
    return this.client !== undefined;
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        if (!this.client) {
          this.connection = await Connection.connect({ address: this.address });
          this.client = new Client({ connection: this.connection });
        }
        if (!this.running) break;
        const dispatched = await this.dispatchBatch();
        if (dispatched === 0) await wait(this.pollIntervalMs);
      } catch (error) {
        this.logger.error({ err: error }, 'Temporal workflow dispatch failed');
        await this.connection?.close().catch((closeError: unknown) => {
          this.logger.error({ err: closeError }, 'Temporal client connection close failed');
        });
        this.connection = undefined;
        this.client = undefined;
        await wait(this.pollIntervalMs);
      }
    }
  }

  private async dispatchBatch(): Promise<number> {
    const events = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE outbox_events
        SET workflow_failed_at = NOW(), workflow_locked_until = NULL
        WHERE status = 'PUBLISHED'
          AND workflow_started_at IS NULL
          AND workflow_attempts >= ${MAX_DELIVERY_ATTEMPTS}
          AND (workflow_locked_until IS NULL OR workflow_locked_until < NOW())
      `;

      return transaction.$queryRaw<DispatchableEvent[]>`
        UPDATE outbox_events
        SET workflow_locked_until = NOW() + (${LOCK_DURATION_MS} * INTERVAL '1 millisecond'),
            workflow_attempts = workflow_attempts + 1
        WHERE id IN (
          SELECT id
          FROM outbox_events
          WHERE status = 'PUBLISHED'
            AND workflow_started_at IS NULL
            AND workflow_failed_at IS NULL
            AND workflow_attempts < ${MAX_DELIVERY_ATTEMPTS}
            AND workflow_available_at <= NOW()
            AND (workflow_locked_until IS NULL OR workflow_locked_until < NOW())
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        RETURNING id, payload, trace_context AS "traceContext",
            workflow_attempts AS "workflowAttempts"
      `;
    });

    if (events.length === 0) return 0;

    for (const event of events) {
      try {
        await this.startWorkflow(event.payload, event.traceContext ?? undefined);
        await this.prisma.$executeRaw`
          UPDATE outbox_events
          SET workflow_started_at = NOW(), workflow_locked_until = NULL,
              workflow_last_error = NULL, workflow_failed_at = NULL
          WHERE id = ${event.id}::uuid
        `;
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 2000) : 'Unknown Temporal error';
        const retry = event.workflowAttempts < MAX_DELIVERY_ATTEMPTS;
        const delayMs = Math.min(60_000, 1000 * 2 ** Math.min(event.workflowAttempts - 1, 6));
        await this.prisma.$executeRaw`
          UPDATE outbox_events
          SET workflow_available_at = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
              workflow_locked_until = NULL,
              workflow_last_error = ${message},
              workflow_failed_at = CASE WHEN ${retry} THEN NULL ELSE NOW() END
          WHERE id = ${event.id}::uuid
        `;
        this.logger.error(
          {
            err: error,
            outboxEventId: event.id,
            correlationId: event.payload.correlationId,
          },
          'order workflow start failed'
        );
        await this.resetClient();
      }
    }

    return events.length;
  }

  private async startWorkflow(
    event: OrderCreatedEvent,
    traceContext: TraceContextCarrier | undefined
  ): Promise<void> {
    if (!this.client) throw new Error('Temporal client is not connected');

    await runWithTraceSpan(
      'orders-service',
      'temporal.workflow.start',
      traceContext,
      async (activeContext) => {
        const span = trace.getSpan(activeContext);
        const input: OrderFulfillmentInput = {
          ...event.payload,
          correlationId: event.correlationId,
          traceContext: createTraceContext(span?.spanContext()),
        };

        try {
          await this.client?.workflow.start('OrderFulfillmentWorkflow', {
            workflowId: `order-fulfillment-${input.orderId}`,
            workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
            taskQueue: this.taskQueue,
            args: [input],
          });
          this.logger.info(
            {
              orderId: input.orderId,
              correlationId: input.correlationId,
              traceId: span?.spanContext().traceId,
            },
            'Temporal order workflow started'
          );
        } catch (error) {
          if (error instanceof WorkflowExecutionAlreadyStartedError) return;
          throw error;
        }
      }
    );
  }

  private async resetClient(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.client = undefined;
    await connection?.close().catch((error: unknown) => {
      this.logger.error({ err: error }, 'Temporal client connection close failed');
    });
  }
}
