import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Client, Connection } from '@temporalio/client';
import { connect, JSONCodec, type NatsConnection, type Subscription } from 'nats';
import { describe, expect, it } from 'vitest';

const e2e = process.env.E2E_ORDER_JOURNEY === '1' ? describe : describe.skip;
const gatewayUrl = process.env.ORDER_JOURNEY_GATEWAY_URL ?? 'http://127.0.0.1:3000';
const natsUrl = process.env.ORDER_JOURNEY_NATS_URL ?? 'nats://127.0.0.1:4222';
const temporalAddress = process.env.ORDER_JOURNEY_TEMPORAL_ADDRESS ?? '127.0.0.1:7233';
const s3Endpoint = process.env.ORDER_JOURNEY_S3_ENDPOINT ?? 'http://127.0.0.1:9000';
const postgresUser = process.env.POSTGRES_USER ?? 'dev';
const s3AccessKeyId = process.env.LOCAL_S3_ACCESS_KEY_ID ?? 'minioadmin';
const s3SecretAccessKey = process.env.LOCAL_S3_SECRET_ACCESS_KEY ?? 'minioadmin';
const timeoutMs = 90_000;

type OrderJourneyEvent = {
  eventId: string;
  eventType: string;
  correlationId: string;
  occurredAt: string;
  payload: {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
};

type OutboxSnapshot = {
  id: string;
  status: string;
  publishedAt: string | null;
  workflowStartedAt: string | null;
  rawExportedAt: string | null;
  traceContext: { traceparent?: string } | null;
  event: OrderJourneyEvent;
};

type Session = { accessToken: string; userId: string };
type JourneyOrder = {
  id: string;
  status: string;
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
};

async function waitFor<T>(
  description: string,
  read: () => Promise<T>,
  isReady: (value: T) => boolean,
  intervalMs = 1_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await read();
    if (isReady(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out waiting for ${description}; last observed value: ${JSON.stringify(lastValue)}`
  );
}

async function withTimeout<T>(promise: Promise<T>, waitMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function queryDatabase(database: string, query: string): string {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'infra/docker-compose.dev.yml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      postgresUser,
      '-d',
      database,
      '-At',
      '-c',
      query,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

function readOutboxEvent(correlationId: string): OutboxSnapshot | null {
  const query = `
    SELECT json_build_object(
      'id', id,
      'status', status,
      'publishedAt', published_at,
      'workflowStartedAt', workflow_started_at,
      'rawExportedAt', raw_exported_at,
      'traceContext', trace_context,
      'event', payload
    )::text
    FROM outbox_events
    WHERE payload->>'correlationId' = '${correlationId}'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const result = queryDatabase('orders', query);
  return result ? (JSON.parse(result) as OutboxSnapshot) : null;
}

function readPaymentStatus(orderId: string): string | null {
  if (!/^[\da-f-]{36}$/i.test(orderId)) throw new Error('Order ID must be a UUID');
  return queryDatabase(
    'payments',
    `SELECT status FROM order_payments WHERE order_id = '${orderId}'`
  );
}

function readReservationCount(orderId: string): number {
  if (!/^[\da-f-]{36}$/i.test(orderId)) throw new Error('Order ID must be a UUID');
  return Number(
    queryDatabase('inventory', `SELECT COUNT(*) FROM reservations WHERE order_id = '${orderId}'`)
  );
}

async function readNatsEvent(
  subscription: Subscription
): Promise<{ event: OrderJourneyEvent; traceparent: string | undefined }> {
  for await (const message of subscription) {
    return {
      event: JSONCodec<OrderJourneyEvent>().decode(message.data),
      traceparent: message.headers?.get('traceparent') || undefined,
    };
  }
  throw new Error('NATS subscription ended before an order event arrived');
}

async function createAndObserveOrder(
  nats: NatsConnection,
  s3: S3Client,
  session: Session,
  items: JourneyOrder['items']
): Promise<{ order: JourneyOrder; event: OrderJourneyEvent; outbox: OutboxSnapshot }> {
  const subscription = nats.subscribe('orders.order.created', { max: 1 });
  await nats.flush();
  const natsEventPromise = readNatsEvent(subscription);

  try {
    const correlationId = randomUUID();
    const traceId = randomUUID().replaceAll('-', '');
    const parentSpanId = randomUUID().replaceAll('-', '').slice(0, 16);
    const response = await fetch(`${gatewayUrl}/orders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
        traceparent: `00-${traceId}-${parentSpanId}-01`,
      },
      body: JSON.stringify({ items }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-correlation-id')).toBe(correlationId);
    expect(response.headers.get('x-trace-id')).toBe(traceId);

    const order = (await response.json()) as JourneyOrder;
    expect(order).toMatchObject({ userId: session.userId, status: 'pending', items });

    const [natsMessage, outbox] = await Promise.all([
      withTimeout(natsEventPromise, 30_000, 'Timed out waiting for the NATS order event'),
      waitFor(
        'outbox publication, raw export, and Temporal dispatch',
        async () => readOutboxEvent(correlationId),
        (value): value is OutboxSnapshot =>
          value !== null &&
          value.status === 'PUBLISHED' &&
          value.publishedAt !== null &&
          value.workflowStartedAt !== null &&
          value.rawExportedAt !== null
      ),
    ]);
    if (outbox === null) throw new Error('Expected the order outbox row to be present');
    const event = natsMessage.event;

    const storedTraceParent = outbox.traceContext?.traceparent?.split('-');
    const publishedTraceParent = natsMessage.traceparent?.split('-');
    expect(storedTraceParent?.[1]).toBe(traceId);
    expect(publishedTraceParent?.[1]).toBe(traceId);
    expect(publishedTraceParent?.[2]).not.toBe(storedTraceParent?.[2]);
    expect(event).toMatchObject({
      eventType: 'order.created.v1',
      correlationId,
      payload: { orderId: order.id, userId: session.userId, items },
    });
    expect(outbox.event).toMatchObject({
      eventId: event.eventId,
      eventType: 'order.created.v1',
      correlationId,
      payload: { orderId: order.id, userId: session.userId, items },
    });

    const eventDate = new Date(event.occurredAt).toISOString().slice(0, 10);
    const key = `orders/created_date=${eventDate}/events/${outbox.id}.jsonl`;
    const rawObject = await s3.send(new GetObjectCommand({ Bucket: 'raw', Key: key }));
    if (!rawObject.Body) throw new Error(`Raw event object ${key} has no body`);
    const rawEventText = await rawObject.Body.transformToString();
    expect(rawEventText.endsWith('\n')).toBe(true);
    expect(JSON.parse(rawEventText)).toEqual(event);

    return { order, event, outbox };
  } finally {
    subscription.unsubscribe();
  }
}

e2e('authenticated order journey across local services', () => {
  it('confirms a successful order and refunds/cancels an order with unavailable inventory', async () => {
    let nats: NatsConnection | undefined;
    let temporalConnection: Connection | undefined;
    let s3: S3Client | undefined;

    try {
      nats = await connect({ servers: natsUrl });
      s3 = new S3Client({
        endpoint: s3Endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey },
      });

      const unauthenticated = await fetch(`${gatewayUrl}/orders`, { method: 'GET' });
      expect(unauthenticated.status).toBe(401);

      const email = `order-journey-${randomUUID()}@example.com`;
      const password = 'journey-test-password';
      const register = await fetch(`${gatewayUrl}/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(register.status).toBe(201);

      const login = await fetch(`${gatewayUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      const session = (await login.json()) as Session;

      const setupIntentResponse = await fetch(
        `${gatewayUrl}/payments/payment-methods/setup-intents`,
        { method: 'POST', headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      expect(setupIntentResponse.status).toBe(200);
      const setupIntent = (await setupIntentResponse.json()) as { setupIntentId: string };

      const setDefaultPaymentMethod = await fetch(
        `${gatewayUrl}/payments/payment-methods/default`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ setupIntentId: setupIntent.setupIntentId }),
        }
      );
      expect(setDefaultPaymentMethod.status).toBe(200);

      const successfulJourney = await createAndObserveOrder(nats, s3, session, [
        { productId: 'sku-coffee', quantity: 1 },
      ]);
      temporalConnection = await Connection.connect({ address: temporalAddress });
      const temporal = new Client({ connection: temporalConnection });
      const successfulWorkflowId = `order-fulfillment-${successfulJourney.order.id}`;
      const successfulWorkflow = temporal.workflow.getHandle(successfulWorkflowId);
      const completedWorkflow = await waitFor(
        `successful workflow ${successfulWorkflowId}`,
        () => successfulWorkflow.describe(),
        (description) => description.status.name === 'COMPLETED'
      );
      expect(completedWorkflow.status.name).toBe('COMPLETED');
      await successfulWorkflow.result();

      const confirmedOrderResponse = await fetch(
        `${gatewayUrl}/orders/${successfulJourney.order.id}`,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      expect(confirmedOrderResponse.status).toBe(200);
      expect(await confirmedOrderResponse.json()).toMatchObject({
        id: successfulJourney.order.id,
        status: 'confirmed',
      });
      expect(
        await waitFor(
          'successful payment to be charged',
          async () => readPaymentStatus(successfulJourney.order.id),
          (status) => status === 'CHARGED'
        )
      ).toBe('CHARGED');
      expect(readReservationCount(successfulJourney.order.id)).toBe(1);

      const compensatedJourney = await createAndObserveOrder(nats, s3, session, [
        { productId: 'sku-coffee', quantity: 100 },
      ]);
      const compensatedWorkflowId = `order-fulfillment-${compensatedJourney.order.id}`;
      const compensatedWorkflow = temporal.workflow.getHandle(compensatedWorkflowId);
      const compensatedWorkflowDescription = await waitFor(
        `inventory compensation workflow ${compensatedWorkflowId}`,
        () => compensatedWorkflow.describe(),
        (description) => description.status.name === 'COMPLETED'
      );
      expect(compensatedWorkflowDescription.status.name).toBe('COMPLETED');
      const result = await compensatedWorkflow.result();
      expect(result).toMatchObject({ status: 'cancelled', reason: 'inventory_unavailable' });

      const cancelledOrderResponse = await fetch(
        `${gatewayUrl}/orders/${compensatedJourney.order.id}`,
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
      expect(cancelledOrderResponse.status).toBe(200);
      expect(await cancelledOrderResponse.json()).toMatchObject({
        id: compensatedJourney.order.id,
        status: 'cancelled',
      });
      expect(
        await waitFor(
          'compensated payment to be refunded',
          async () => readPaymentStatus(compensatedJourney.order.id),
          (status) => status === 'REFUNDED'
        )
      ).toBe('REFUNDED');
      expect(readReservationCount(compensatedJourney.order.id)).toBe(0);

      console.info('[order-journey] verified', {
        successfulOrderId: successfulJourney.order.id,
        successfulWorkflow: completedWorkflow.status.name,
        successfulPayment: 'CHARGED',
        inventoryReservation: 'created',
        compensatedOrderId: compensatedJourney.order.id,
        compensationWorkflow: compensatedWorkflowDescription.status.name,
        compensatedPayment: 'REFUNDED',
        compensatedOrder: 'cancelled',
      });
    } finally {
      await nats?.close();
      await temporalConnection?.close();
      s3?.destroy();
    }
  }, 240_000);
});
