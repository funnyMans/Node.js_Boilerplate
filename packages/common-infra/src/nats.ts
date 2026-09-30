import { connect, headers, NatsConnection, StringCodec, JSONCodec } from 'nats';
import type { EventEnvelope } from '@app/contracts';

export async function createNatsClient(url?: string): Promise<NatsConnection> {
  const nc = await connect({ servers: url ?? process.env.NATS_URL ?? '127.0.0.1:4222' });
  nc.closed().catch((err) => console.error('NATS closed with error', err));
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
  handler: (event: EventEnvelope<TPayload>) => Promise<void> | void
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
  })().catch((error) => {
    console.error(`NATS subscription failed for ${subject}`, error);
  });

  return sub;
}
