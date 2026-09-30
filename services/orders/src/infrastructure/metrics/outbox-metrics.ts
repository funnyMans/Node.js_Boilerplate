import { Gauge, type Registry } from 'prom-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const stages = ['nats', 'workflow', 'raw_export'] as const;
type DeliveryStage = (typeof stages)[number];

type StageSnapshot = {
  stage: DeliveryStage;
  backlogEvents: number;
  oldestAgeSeconds: number;
  retryEvents: number;
};

export function registerOutboxMetrics(prisma: PrismaClient, registry: Registry): void {
  let cachedSnapshots: Promise<StageSnapshot[]> | undefined;
  let snapshotsCachedAt = 0;
  const getStageSnapshots = () => {
    if (!cachedSnapshots || Date.now() - snapshotsCachedAt >= 1_000) {
      snapshotsCachedAt = Date.now();
      cachedSnapshots = readStageSnapshots(prisma).catch((error: unknown) => {
        cachedSnapshots = undefined;
        throw error;
      });
    }
    return cachedSnapshots;
  };

  new Gauge({
    name: 'orders_service_outbox_backlog_events',
    help: 'Unfinished order outbox events awaiting a delivery stage',
    labelNames: ['stage'] as const,
    registers: [registry],
    async collect() {
      const snapshots = await getStageSnapshots();
      for (const stage of stages) {
        const snapshot = snapshots.find((candidate) => candidate.stage === stage);
        this.set({ stage }, snapshot?.backlogEvents ?? 0);
      }
    },
  });

  new Gauge({
    name: 'orders_service_outbox_oldest_backlog_age_seconds',
    help: 'Age of the oldest unfinished order outbox event for a delivery stage',
    labelNames: ['stage'] as const,
    registers: [registry],
    async collect() {
      const snapshots = await getStageSnapshots();
      for (const stage of stages) {
        const snapshot = snapshots.find((candidate) => candidate.stage === stage);
        this.set({ stage }, snapshot?.oldestAgeSeconds ?? 0);
      }
    },
  });

  new Gauge({
    name: 'orders_service_outbox_retry_events',
    help: 'Unfinished order outbox events that have been attempted at a delivery stage',
    labelNames: ['stage'] as const,
    registers: [registry],
    async collect() {
      const snapshots = await getStageSnapshots();
      for (const stage of stages) {
        const snapshot = snapshots.find((candidate) => candidate.stage === stage);
        this.set({ stage }, snapshot?.retryEvents ?? 0);
      }
    },
  });

  new Gauge({
    name: 'orders_service_outbox_failed_events',
    help: 'Order outbox events that exhausted NATS publication attempts',
    registers: [registry],
    async collect() {
      const [result] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM outbox_events
        WHERE subject = 'orders.order.created'
          AND status = 'FAILED'
      `;
      this.set(Number(result?.count ?? 0));
    },
  });

  new Gauge({
    name: 'orders_service_outbox_workflow_failed_events',
    help: 'Order outbox events that exhausted Temporal workflow dispatch attempts',
    registers: [registry],
    async collect() {
      const [result] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM outbox_events
        WHERE workflow_failed_at IS NOT NULL
      `;
      this.set(Number(result?.count ?? 0));
    },
  });

  new Gauge({
    name: 'orders_service_outbox_raw_export_failed_events',
    help: 'Order outbox events that exhausted raw object export attempts',
    registers: [registry],
    async collect() {
      const [result] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM outbox_events
        WHERE raw_export_failed_at IS NOT NULL
      `;
      this.set(Number(result?.count ?? 0));
    },
  });
}

async function readStageSnapshots(prisma: PrismaClient): Promise<StageSnapshot[]> {
  return prisma.$queryRaw<StageSnapshot[]>`
    WITH delivery_stages AS (
      SELECT
        'nats' AS stage,
        created_at,
        attempts AS delivery_attempts
      FROM outbox_events
      WHERE subject = 'orders.order.created'
        AND status IN ('PENDING', 'PROCESSING')

      UNION ALL

      SELECT
        'workflow' AS stage,
        created_at,
        workflow_attempts AS delivery_attempts
      FROM outbox_events
      WHERE subject = 'orders.order.created'
        AND status = 'PUBLISHED'
        AND workflow_started_at IS NULL
        AND workflow_failed_at IS NULL

      UNION ALL

      SELECT
        'raw_export' AS stage,
        created_at,
        raw_export_attempts AS delivery_attempts
      FROM outbox_events
      WHERE subject = 'orders.order.created'
        AND raw_exported_at IS NULL
        AND raw_export_failed_at IS NULL
    )
    SELECT
      stage,
      COUNT(*)::int AS "backlogEvents",
      COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))), 0)::float8 AS "oldestAgeSeconds",
      COUNT(*) FILTER (WHERE delivery_attempts > 0)::int AS "retryEvents"
    FROM delivery_stages
    GROUP BY stage
  `;
}
