import { describe, expect, it, vi } from 'vitest';
import { createDomainEvent } from '@app/contracts';
import type { NatsMessage, NatsPublisher, NatsSubscriber } from '../../src/nats';
import { publishEvent, subscribeTo } from '../../src/nats';

describe('nats transport helpers', () => {
  const logger = {
    error: vi.fn(),
  };

  it('publishes a domain event to a subject', async () => {
    const published: {
      subject: string;
      data: Uint8Array;
      options: { msgID: string; headers?: { get: (name: string) => string } };
    }[] = [];
    const nc: NatsPublisher = {
      publish: async (
        subject: string,
        data: Uint8Array,
        options?: { msgID: string; headers?: { get: (name: string) => string } }
      ) => {
        published.push({ subject, data, options: options ?? { msgID: '' } });
        return { stream: 'ORDERS', seq: 1, duplicate: false };
      },
    };

    const event = createDomainEvent({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
      correlationId: 'corr-1',
      payload: { userId: 'u_123', email: 'person@example.com' },
    });

    const acknowledgement = await publishEvent(
      nc,
      'app.users.v1.user.created',
      event,
      event.eventId,
      {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        baggage: 'not-propagated',
      }
    );

    expect(acknowledgement).toMatchObject({ stream: 'ORDERS', seq: 1 });
    expect(published).toHaveLength(1);
    expect(published[0].subject).toBe('app.users.v1.user.created');
    expect(published[0].options.msgID).toBe(event.eventId);
    expect(published[0].data).toBeInstanceOf(Uint8Array);
    expect(published[0].options?.headers?.get('traceparent')).toBe(
      '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01'
    );
    expect(published[0].options?.headers?.get('baggage')).toBe('');
  });

  it('subscribes to a subject and calls the handler with the decoded event', async () => {
    const handler = vi.fn();
    const event = createDomainEvent({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
      correlationId: 'corr-2',
      payload: { userId: 'u_456', email: 'other@example.com' },
    });

    const nc: NatsSubscriber = {
      subscribe: () => ({
        [Symbol.asyncIterator]: async function* () {
          const message: NatsMessage = {
            data: new TextEncoder().encode(JSON.stringify(event)),
          };
          yield message;
        },
        unsubscribe: vi.fn(),
      }),
    };

    subscribeTo(nc, 'app.users.v1.user.created', handler, logger);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      eventType: 'user.created.v1',
      sourceService: 'users-service',
    });
  });

  it('logs subscription handler failures with subject context', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const error = new Error('handler failed');
    handler.mockRejectedValueOnce(error);
    const unsubscribe = vi.fn();
    const nc: NatsSubscriber = {
      subscribe: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield { data: new TextEncoder().encode('{}') };
        },
        unsubscribe,
      }),
    };

    subscribeTo(nc, 'app.users.v1.user.created', handler, logger);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, subject: 'app.users.v1.user.created' },
      'NATS subscription failed'
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
