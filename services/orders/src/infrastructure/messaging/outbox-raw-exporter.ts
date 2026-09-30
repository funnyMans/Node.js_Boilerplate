import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { trace } from '@opentelemetry/api';
import type { FastifyBaseLogger } from 'fastify';
import type { OrderCreatedEvent } from '@app/contracts';
import { runWithTraceSpan } from '@app/common';
import type { TraceContextCarrier } from '@app/common';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createRawEventObject } from './raw-event-object';

const BATCH_SIZE = 50;
const LOCK_DURATION_MS = 30_000;
const MAX_DELIVERY_ATTEMPTS = 10;

type ExportableEvent = {
  id: string;
  payload: OrderCreatedEvent;
  traceContext: TraceContextCarrier | null;
  rawExportAttempts: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OutboxRawExporter {
  private running = false;
  private loopPromise: Promise<void> | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly pollIntervalMs = 1000
  ) {}

  start(): void {
    if (this.loopPromise) throw new Error('Outbox raw exporter has already been started');
    this.running = true;
    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.running = false;
    try {
      await this.loopPromise;
    } finally {
      this.s3.destroy();
    }
  }

  private async run(): Promise<void> {
    while (this.running) {
      try {
        const exported = await this.exportBatch();
        if (exported === 0) await wait(this.pollIntervalMs);
      } catch (error) {
        this.logger.error({ err: error }, 'outbox raw export polling failed');
        await wait(this.pollIntervalMs);
      }
    }
  }

  private async exportBatch(): Promise<number> {
    const events = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        UPDATE outbox_events
        SET raw_export_failed_at = NOW(), raw_export_locked_until = NULL
        WHERE subject = 'orders.order.created'
          AND raw_exported_at IS NULL
          AND raw_export_failed_at IS NULL
          AND raw_export_attempts >= ${MAX_DELIVERY_ATTEMPTS}
          AND raw_export_locked_until < NOW()
      `;

      return transaction.$queryRaw<ExportableEvent[]>`
          UPDATE outbox_events
          SET raw_export_locked_until = NOW() + (${LOCK_DURATION_MS} * INTERVAL '1 millisecond'),
              raw_export_attempts = raw_export_attempts + 1
          WHERE id IN (
            SELECT id
            FROM outbox_events
            WHERE subject = 'orders.order.created'
              AND raw_exported_at IS NULL
              AND raw_export_failed_at IS NULL
              AND raw_export_attempts < ${MAX_DELIVERY_ATTEMPTS}
              AND raw_export_available_at <= NOW()
              AND (raw_export_locked_until IS NULL OR raw_export_locked_until < NOW())
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT ${BATCH_SIZE}
          )
          RETURNING id, payload, trace_context AS "traceContext",
              raw_export_attempts AS "rawExportAttempts"
        `;
    });

    if (events.length === 0) return 0;

    for (const event of events) {
      try {
        await runWithTraceSpan(
          'orders-service',
          'messaging.s3.raw_export',
          event.traceContext ?? undefined,
          async (activeContext) => {
            const rawObject = createRawEventObject(event.id, event.payload);
            const traceId = trace.getSpan(activeContext)?.spanContext().traceId;
            this.logger.info(
              {
                outboxEventId: event.id,
                correlationId: event.payload.correlationId,
                traceId,
                objectKey: rawObject.key,
              },
              'exporting order event to object storage'
            );
            await this.s3.send(
              new PutObjectCommand({
                Bucket: this.bucket,
                Key: rawObject.key,
                Body: rawObject.body,
                ContentType: 'application/x-ndjson',
              })
            );
            await this.prisma.$executeRaw`
              UPDATE outbox_events
              SET raw_exported_at = NOW(), raw_export_locked_until = NULL,
                  raw_export_last_error = NULL, raw_export_failed_at = NULL
              WHERE id = ${event.id}::uuid AND raw_exported_at IS NULL
            `;
          }
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 2000) : 'Unknown raw export error';
        const retry = event.rawExportAttempts < MAX_DELIVERY_ATTEMPTS;
        const delayMs = Math.min(60_000, 1000 * 2 ** Math.min(event.rawExportAttempts - 1, 6));
        await this.prisma.$executeRaw`
          UPDATE outbox_events
          SET raw_export_available_at = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
              raw_export_locked_until = NULL,
              raw_export_last_error = ${message},
              raw_export_failed_at = CASE WHEN ${retry} THEN NULL ELSE NOW() END
          WHERE id = ${event.id}::uuid AND raw_exported_at IS NULL
        `;
        this.logger.error(
          { err: error, outboxEventId: event.id, correlationId: event.payload.correlationId },
          'order event raw export failed; retry scheduled'
        );
      }
    }

    return events.length;
  }
}
