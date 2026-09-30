import type { OrderCreatedEvent } from '@app/contracts';

export type RawEventObject = {
  key: string;
  body: string;
};

export function createRawEventObject(
  outboxEventId: string,
  event: OrderCreatedEvent
): RawEventObject {
  if (!/^[\da-f-]{36}$/i.test(outboxEventId)) {
    throw new Error('Outbox event ID must be a UUID');
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(event.occurredAt)) {
    throw new Error('Order event occurredAt must include a timezone');
  }

  const occurredAt = new Date(event.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Order event occurredAt must be a valid timestamp');
  }
  if (event.eventType !== 'order.created.v1' || event.version !== 1) {
    throw new Error('Unsupported order event contract');
  }

  const createdDate = occurredAt.toISOString().slice(0, 10);

  return {
    key: `orders/created_date=${createdDate}/events/${outboxEventId}.jsonl`,
    body: `${JSON.stringify(event)}\n`,
  };
}
