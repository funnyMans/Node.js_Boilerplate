import { describe, expect, it } from 'vitest';
import { createDomainEvent, eventTypes } from '../../src/index';

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
  });

  it('defines the versioned order-created event name', () => {
    expect(eventTypes.orderCreated).toBe('order.created.v1');
  });
});
