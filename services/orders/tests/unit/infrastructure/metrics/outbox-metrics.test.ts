import { Registry } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../../src/generated/prisma/client';
import { registerOutboxMetrics } from '../../../../src/infrastructure/metrics/outbox-metrics';

describe('outbox metrics', () => {
  it('exports stage backlog, age, retry, and failed-event gauges', async () => {
    const snapshots = [
      { stage: 'nats', backlogEvents: 2, oldestAgeSeconds: 42, retryEvents: 1 },
      { stage: 'workflow', backlogEvents: 1, oldestAgeSeconds: 20, retryEvents: 0 },
    ];
    let queryCount = 0;
    const prisma = {
      $queryRaw: vi.fn(async () => {
        queryCount += 1;
        return queryCount === 1 ? snapshots : [{ count: 0n }];
      }),
    } as unknown as PrismaClient;
    const registry = new Registry();

    registerOutboxMetrics(prisma, registry);
    const metrics = await registry.metrics();

    expect(metrics).toContain('orders_service_outbox_backlog_events{stage="nats"} 2');
    expect(metrics).toContain('orders_service_outbox_backlog_events{stage="workflow"} 1');
    expect(metrics).toContain('orders_service_outbox_backlog_events{stage="raw_export"} 0');
    expect(metrics).toContain('orders_service_outbox_oldest_backlog_age_seconds{stage="nats"} 42');
    expect(metrics).toContain('orders_service_outbox_retry_events{stage="nats"} 1');
    expect(metrics).toContain('orders_service_outbox_failed_events 0');
    expect(metrics).toContain('orders_service_outbox_workflow_failed_events 0');
    expect(metrics).toContain('orders_service_outbox_raw_export_failed_events 0');
  });
});
