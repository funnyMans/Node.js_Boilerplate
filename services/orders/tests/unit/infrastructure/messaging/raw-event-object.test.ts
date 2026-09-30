import { describe, expect, it } from 'vitest';
import type { OrderCreatedEvent } from '@app/contracts';
import { createRawEventObject } from '../../../../src/infrastructure/messaging/raw-event-object';

const event: OrderCreatedEvent = {
  eventId: 'event-1',
  eventType: 'order.created.v1',
  sourceService: 'orders-service',
  version: 1,
  occurredAt: '2026-09-27T23:30:00-02:00',
  correlationId: 'correlation-1',
  retryable: false,
  payload: {
    orderId: 'order-1',
    userId: 'user-1',
    items: [{ productId: 'sku-1', quantity: 2 }],
  },
};

describe('createRawEventObject', () => {
  it('creates a deterministic UTC-partitioned JSONL object', () => {
    const created = createRawEventObject('fd924839-1bab-4d77-a040-4a08d1754c7d', event);

    expect(created.key).toBe(
      'orders/created_date=2026-09-28/events/fd924839-1bab-4d77-a040-4a08d1754c7d.jsonl'
    );
    expect(created.body).toBe(`${JSON.stringify(event)}\n`);
  });

  it('rejects invalid event timestamps and unsupported event versions', () => {
    expect(() =>
      createRawEventObject('fd924839-1bab-4d77-a040-4a08d1754c7d', {
        ...event,
        occurredAt: '2026-09-27T23:30:00',
      })
    ).toThrow('must include a timezone');
    expect(() =>
      createRawEventObject('fd924839-1bab-4d77-a040-4a08d1754c7d', {
        ...event,
        version: 2,
      })
    ).toThrow('Unsupported order event contract');
  });
});
