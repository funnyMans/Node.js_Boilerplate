import { describe, expect, it, vi } from 'vitest';
import { createDomainEvent } from '@app/contracts';
import { publishEvent, subscribeTo } from '../../src/nats';

describe('nats transport helpers', () => {
  it('publishes a domain event to a subject', async () => {
    const published: {
      subject: string;
      data: Uint8Array;
      options?: { headers?: { get: (name: string) => string } };
    }[] = [];
    const nc = {
      publish: (
        subject: string,
        data: Uint8Array,
        options?: { headers?: { get: (name: string) => string } }
      ) => {
        published.push({ subject, data, options });
      },
    } as any;

    const event = createDomainEvent({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
      correlationId: 'corr-1',
      payload: { userId: 'u_123', email: 'person@example.com' },
    });

    await publishEvent(nc, 'app.users.v1.user.created', event, {
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      baggage: 'not-propagated',
    });

    expect(published).toHaveLength(1);
    expect(published[0].subject).toBe('app.users.v1.user.created');
    expect(published[0].data).toBeInstanceOf(Uint8Array);
    expect(published[0].options?.headers?.get('traceparent')).toBe(
      '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01'
    );
    expect(published[0].options?.headers?.get('baggage')).toBe('');
  });

  it('subscribes to a subject and calls the handler with the decoded event', async () => {
    const handler = vi.fn();
    const ack = vi.fn();
    const event = createDomainEvent({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
      correlationId: 'corr-2',
      payload: { userId: 'u_456', email: 'other@example.com' },
    });

    const nc = {
      subscribe: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield {
            data: new TextEncoder().encode(JSON.stringify(event)),
            ack,
          };
        },
      }),
    } as any;

    subscribeTo(nc, 'app.users.v1.user.created', handler);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
    });
    expect(ack).toHaveBeenCalledTimes(1);
  });
});
