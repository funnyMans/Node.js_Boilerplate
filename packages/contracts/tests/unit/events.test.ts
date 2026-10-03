import { describe, expect, it } from 'vitest';
import {
  createDomainEvent,
  eventTypes,
  type EventEnvelope,
  type UserCreatedEvent,
} from '../../src/index';

describe('event contract', () => {
  it('creates a standardized event envelope', () => {
    const event = createDomainEvent({
      eventType: eventTypes.userCreated,
      sourceService: 'users-service',
      correlationId: 'corr-1',
      traceId: 'trace-1',
      payload: {
        userId: 'u_123',
        email: 'person@example.com',
        status: 'active',
      },
    });

    expect(event.eventType).toBe(eventTypes.userCreated);
    expect(event.sourceService).toBe('users-service');
    expect(event.correlationId).toBe('corr-1');
    expect(event.traceId).toBe('trace-1');
    expect(event.retryable).toBe(false);
    expect(event.payload).toMatchObject({
      userId: 'u_123',
      email: 'person@example.com',
      status: 'active',
    });
    expect(event.eventId).toBeTypeOf('string');
    expect(event.occurredAt).toBeTypeOf('string');
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    expect(event.version).toBe(1);
  });

  it('defines the versioned order-created event name', () => {
    expect(eventTypes.orderCreated).toBe('order.created.v1');
  });

  it('preserves the literal event type and corresponding payload type', () => {
    const event = createDomainEvent({
      eventType: eventTypes.userCreated,
      sourceService: 'users-service',
      correlationId: 'corr-1',
      payload: {
        userId: 'u_123',
        email: 'person@example.com',
        status: 'active',
      },
    });

    const typedEvent: UserCreatedEvent = event;
    const genericEvent: EventEnvelope<UserCreatedEvent['payload']> = event;

    expect(typedEvent).toEqual(genericEvent);
  });

  it('supports explicit version and retry metadata', () => {
    const event = createDomainEvent({
      eventType: eventTypes.orderCreated,
      sourceService: 'orders-service',
      correlationId: 'corr-2',
      retryable: true,
      version: 2,
      payload: {
        orderId: 'order-1',
        userId: 'user-1',
        items: [{ productId: 'sku-1', quantity: 2 }],
      },
    });

    expect(event.version).toBe(2);
    expect(event.retryable).toBe(true);
  });
});
