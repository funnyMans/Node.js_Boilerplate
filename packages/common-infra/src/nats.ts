import { connect, headers, NatsConnection, StringCodec, JSONCodec } from 'nats';
import type { EventEnvelope } from '@app/contracts';
import type { InfrastructureLogger } from './redis';

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
  nc: Pick<NatsConnection, 'publish'>,
  subject: string,
  event: EventEnvelope<TPayload>,
  traceContext?: Record<string, string>
): Promise<void> {
  const payload = jc.encode(event);
  const messageHeaders = headers();
  let hasTraceHeaders = false;
  for (const [name, value] of Object.entries(traceContext ?? {})) {
    if (name === 'traceparent' || name === 'tracestate') {
      messageHeaders.set(name, value);
      hasTraceHeaders = true;
    }
  }
  nc.publish(subject, payload, hasTraceHeaders ? { headers: messageHeaders } : undefined);
}

export function subscribeTo<TPayload>(
  nc: Pick<NatsConnection, 'subscribe'>,
  subject: string,
  handler: (event: EventEnvelope<TPayload>) => Promise<void> | void,
  logger: InfrastructureLogger
) {
  const sub = nc.subscribe(subject);

  (async () => {
    for await (const msg of sub as any) {
      const event = jc.decode((msg as any).data) as EventEnvelope<TPayload>;
      await handler(event);

      if (typeof (msg as any).ack === 'function') {
        await (msg as any).ack();
      }
    }
  })().catch((error: unknown) => {
    logger.error(
      { err: error instanceof Error ? error : new Error(String(error)), subject },
      'NATS subscription failed'
    );
  });

  return sub;
}
