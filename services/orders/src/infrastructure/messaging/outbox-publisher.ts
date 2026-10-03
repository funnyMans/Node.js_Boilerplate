import type { FastifyBaseLogger } from 'fastify';
import type { NatsConnection } from 'nats';
import { createTraceContext, runWithTraceSpan } from '@app/common';
import type { TraceContextCarrier } from '@app/common';
import { trace } from '@opentelemetry/api';
import { publishEvent } from '@nodejs-boilerplate/common-infra';
import type { OrderCreatedEvent } from '@app/contracts';
import type { PrismaClient } from '../../../generated/prisma/client';
import { ensureOrderEventsStream } from './nats-stream';

const BATCH_SIZE = 50;
const LOCK_DURATION_MS = 30_000;
const MAX_DELIVERY_ATTEMPTS = 10;
const RETENTION_BATCH_SIZE = 500;
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

type ClaimedEvent = {
  id: string;
  subject: string;
  payload: OrderCreatedEvent;
  traceContext: TraceContextCarrier | null;
  attempts: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OutboxPublisher {
  private running = false;
  private loopPromise: Promise<void> | undefined;
  private connection: NatsConnection | undefined;
  private streamReadyConnection: NatsConnection | undefined;
  private nextRetentionSweepAt = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
    private readonly connect: () => Promise<NatsConnection>,
    private readonly pollIntervalMs = 1000,
    private readonly retentionDays = 0
  ) {}

  start(): void {
    if (this.loopPromise) throw new Error('Outbox publisher has already been started');
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.loopPromise;
    } finally {
      await this.connection?.close();
    }
    this.connection = undefined;
  }

  isConnected(): boolean {
    return (
      this.connection !== undefined &&
      !this.connection.isClosed() &&
      this.streamReadyConnection === this.connection
    );
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        await this.pruneCompletedEventsIfDue();
        if (!this.isConnected()) this.connection = await this.connect();
        if (!this.running) break;
        const connection = this.connection;
        if (!connection) throw new Error('NATS connection is unavailable');
        if (connection !== this.streamReadyConnection) {
          const manager = await connection.jetstreamManager();
          await ensureOrderEventsStream(manager.streams);
          this.streamReadyConnection = connection;
        }
        const published = await this.publishBatch();
        if (published === 0) await wait(this.pollIntervalMs);
      } catch (error) {
        this.logger.error({ err: error }, 'outbox polling failed');
        if (this.connection?.isClosed()) this.connection = undefined;
        await wait(this.pollIntervalMs);
      }
    }
  }

  private async publishBatch(): Promise<number> {
    const connection = this.connection;
    if (!connection) throw new Error('Outbox publisher has no NATS connection');
    const jetstream = connection.jetstream();

    const events = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE outbox_events
        SET status = 'FAILED', last_error = 'Maximum delivery attempts exceeded',
            locked_until = NULL
        WHERE status = 'PROCESSING' AND locked_until < NOW()
          AND attempts >= ${MAX_DELIVERY_ATTEMPTS}
      `;

      return transaction.$queryRaw<ClaimedEvent[]>`
        UPDATE outbox_events
        SET status = 'PROCESSING',
            attempts = attempts + 1,
            locked_until = NOW() + (${LOCK_DURATION_MS} * INTERVAL '1 millisecond')
        WHERE id IN (
          SELECT id
          FROM outbox_events
          WHERE attempts < ${MAX_DELIVERY_ATTEMPTS}
            AND (
              (status = 'PENDING' AND available_at <= NOW())
              OR (status = 'PROCESSING' AND locked_until < NOW())
            )
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        RETURNING id, subject, payload, trace_context AS "traceContext", attempts
      `;
    });

    if (events.length === 0) return 0;

    try {
      for (const event of events) {
        await runWithTraceSpan(
          'orders-service',
          'messaging.nats.publish',
          event.traceContext ?? undefined,
          async (activeContext) => {
            const outgoingTraceContext = createTraceContext(
              trace.getSpan(activeContext)?.spanContext()
            );
            this.logger.info(
              {
                outboxEventId: event.id,
                correlationId: event.payload.correlationId,
                traceId: trace.getSpan(activeContext)?.spanContext().traceId,
                subject: event.subject,
              },
              'publishing order event to NATS'
            );
            await publishEvent(
              jetstream,
              event.subject,
              event.payload,
              event.payload.eventId,
              outgoingTraceContext
            );
          }
        );
      }

      for (const event of events) {
        await this.prisma.$executeRaw`
          UPDATE outbox_events
          SET status = 'PUBLISHED', published_at = NOW(), locked_until = NULL, last_error = NULL
          WHERE id = ${event.id}::uuid
        `;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 2000) : 'Unknown publish error';
      this.logger.error(
        {
          err: error,
          eventCount: events.length,
          correlationIds: events.map((event) => event.payload.correlationId),
        },
        'outbox delivery failed'
      );

      for (const event of events) {
        const retry = event.attempts < MAX_DELIVERY_ATTEMPTS;
        const delayMs = Math.min(60_000, 1000 * 2 ** (event.attempts - 1));
        await this.prisma.$executeRaw`
          UPDATE outbox_events
          SET status = ${retry ? 'PENDING' : 'FAILED'}::"OutboxStatus",
              available_at = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
              locked_until = NULL,
              last_error = ${message}
          WHERE id = ${event.id}::uuid
        `;
      }
    }

    return events.length;
  }

  private async pruneCompletedEventsIfDue(): Promise<void> {
    if (this.retentionDays === 0 || Date.now() < this.nextRetentionSweepAt) return;
    this.nextRetentionSweepAt = Date.now() + RETENTION_SWEEP_INTERVAL_MS;

    const deleted = await this.prisma.$executeRaw`
      DELETE FROM outbox_events
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = 'PUBLISHED'
          AND published_at IS NOT NULL
          AND workflow_started_at IS NOT NULL
          AND raw_exported_at IS NOT NULL
          AND created_at < NOW() - (${this.retentionDays} * INTERVAL '1 day')
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${RETENTION_BATCH_SIZE}
      )
    `;

    if (deleted > 0) {
      this.logger.info(
        { deletedEvents: deleted, retentionDays: this.retentionDays },
        'completed outbox events pruned'
      );
      this.nextRetentionSweepAt = Date.now();
    }
  }
}
