import {
  connect,
  headers,
  NatsConnection,
  StringCodec,
  JSONCodec,
  type JetStreamClient,
  type PubAck,
} from 'nats';
import type { Msg, Subscription } from 'nats';
import type { EventEnvelope } from '@app/contracts';
import type { InfrastructureLogger } from './redis';

export type NatsPublisher = Pick<JetStreamClient, 'publish'>;

export type NatsMessage = Pick<Msg, 'data'>;

export type NatsSubscription = AsyncIterable<NatsMessage> & Pick<Subscription, 'unsubscribe'>;

export type NatsSubscriber = {
  subscribe: (subject: string) => NatsSubscription;
};

export async function createNatsClient(
  url: string | undefined,
  logger: InfrastructureLogger
): Promise<NatsConnection> {
  const nc = await connect({ servers: url ?? process.env.NATS_URL ?? '127.0.0.1:4222' });
  void nc
    .closed()
    .then((err) => {
      if (err) logger.error({ err }, 'NATS connection closed with error');
    })
    .catch((error: unknown) => {
      logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        'NATS connection close notification failed'
      );
    });
  return nc;
}

export const sc = StringCodec();
export const jc = JSONCodec();

export async function publishEvent<TPayload>(
  nc: NatsPublisher,
  subject: string,
  event: EventEnvelope<TPayload>,
  messageId: string,
  traceContext?: Record<string, string>
): Promise<PubAck> {
  const payload = jc.encode(event);
  const messageHeaders = headers();
  let hasTraceHeaders = false;
  for (const [name, value] of Object.entries(traceContext ?? {})) {
    if (name === 'traceparent' || name === 'tracestate') {
      messageHeaders.set(name, value);
      hasTraceHeaders = true;
    }
  }
  return nc.publish(subject, payload, {
    msgID: messageId,
    ...(hasTraceHeaders ? { headers: messageHeaders } : {}),
  });
}

export function subscribeTo<TPayload>(
  nc: NatsSubscriber,
  subject: string,
  handler: (event: EventEnvelope<TPayload>) => Promise<void> | void,
  logger: InfrastructureLogger
) {
  const sub = nc.subscribe(subject);
  const eventCodec = JSONCodec<EventEnvelope<TPayload>>();

  (async () => {
    for await (const msg of sub) {
      const event = eventCodec.decode(msg.data);
      await handler(event);
    }
  })().catch((error: unknown) => {
    sub.unsubscribe();
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)), subject },
      'NATS subscription failed'
    );
  });

  return sub;
}
