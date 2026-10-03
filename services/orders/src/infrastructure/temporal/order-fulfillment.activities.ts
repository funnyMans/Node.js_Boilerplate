import { ApplicationFailure } from '@temporalio/activity';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import { injectTraceContext, runWithTraceSpan } from '@app/common';
import type { TraceContextCarrier } from '@app/common';
import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '../../../generated/prisma/client';
import type { OrderFulfillmentInput } from '../../workflows/order-fulfillment.types';

const paymentResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('charged'), paymentId: z.string().min(1) }),
  z.object({ status: z.literal('declined') }),
]);

const inventoryResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reserved'), reservationId: z.string().min(1) }),
  z.object({ status: z.literal('unavailable') }),
]);

const refundResponseSchema = z.object({ status: z.literal('refunded') });

type ActivityDependencies = {
  prisma: PrismaClient;
  paymentServiceUrl: string;
  inventoryServiceUrl: string;
  serviceToServiceToken: string;
  fetch: typeof globalThis.fetch;
  logger: FastifyBaseLogger;
};

function permanentFailure(message: string): never {
  throw ApplicationFailure.nonRetryable(message, 'ExternalContractError');
}

async function postJson<T>(
  fetcher: typeof globalThis.fetch,
  url: string,
  body: unknown,
  idempotencyKey: string,
  schema: z.ZodType<T>,
  options: {
    specialResponses?: Record<number, 'unavailable' | 'declined'>;
    correlationId?: string;
    serviceToServiceToken: string;
    traceContext?: TraceContextCarrier;
  }
): Promise<T> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: injectTraceContext({
      ...(options.traceContext ?? {}),
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
      'x-service-token': options.serviceToServiceToken,
      ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
    }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  const specialResponse = options.specialResponses?.[response.status];
  if (specialResponse) {
    const parsed = schema.safeParse({ status: specialResponse });
    if (!parsed.success) permanentFailure('External service response did not match its contract');
    return parsed.data;
  }

  if (response.status >= 500 || response.status === 429) {
    throw new Error(`External service returned ${response.status}`);
  }
  if (!response.ok) permanentFailure(`External service rejected the request (${response.status})`);

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    permanentFailure('External service response did not contain valid JSON');
  }

  const parsed = schema.safeParse(responseBody);
  if (!parsed.success) permanentFailure('External service response did not match its contract');
  return parsed.data;
}

export function createOrderFulfillmentActivities(dependencies: ActivityDependencies) {
  const {
    prisma,
    paymentServiceUrl,
    inventoryServiceUrl,
    serviceToServiceToken,
    fetch: fetcher,
    logger,
  } = dependencies;

  function runActivity<T>(
    name: string,
    correlationId: string,
    traceContext: TraceContextCarrier | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    return runWithTraceSpan(
      'orders-service',
      `temporal.activity.${name}`,
      traceContext,
      async (activeContext) => {
        const traceId =
          trace.getSpan(activeContext)?.spanContext().traceId ??
          traceContext?.traceparent?.split('-')[1];
        const fields = { activity: name, correlationId, traceId };
        logger.info(fields, 'Temporal activity started');
        try {
          const result = await operation();
          logger.info(fields, 'Temporal activity completed');
          return result;
        } catch (error) {
          logger.error({ ...fields, err: error }, 'Temporal activity failed');
          throw error;
        }
      }
    );
  }

  return {
    chargePayment(input: OrderFulfillmentInput) {
      return runActivity('charge-payment', input.correlationId, input.traceContext, () =>
        postJson(
          fetcher,
          `${paymentServiceUrl}/payments/charges`,
          { orderId: input.orderId, userId: input.userId, items: input.items },
          `order:${input.orderId}:charge`,
          paymentResponseSchema,
          {
            specialResponses: { 402: 'declined' },
            correlationId: input.correlationId,
            serviceToServiceToken,
            traceContext: input.traceContext,
          }
        )
      );
    },

    reserveInventory(input: OrderFulfillmentInput) {
      return runActivity('reserve-inventory', input.correlationId, input.traceContext, () =>
        postJson(
          fetcher,
          `${inventoryServiceUrl}/inventory/reservations`,
          { orderId: input.orderId, items: input.items },
          `order:${input.orderId}:reserve`,
          inventoryResponseSchema,
          {
            specialResponses: { 409: 'unavailable' },
            correlationId: input.correlationId,
            serviceToServiceToken,
            traceContext: input.traceContext,
          }
        )
      );
    },

    refundPayment(input: {
      orderId: string;
      paymentId: string;
      correlationId: string;
      traceContext?: TraceContextCarrier;
    }) {
      return runActivity('refund-payment', input.correlationId, input.traceContext, () =>
        postJson(
          fetcher,
          `${paymentServiceUrl}/payments/refunds`,
          { orderId: input.orderId, paymentId: input.paymentId },
          `order:${input.orderId}:refund`,
          refundResponseSchema,
          {
            correlationId: input.correlationId,
            serviceToServiceToken,
            traceContext: input.traceContext,
          }
        )
      );
    },

    confirmOrder(input: {
      orderId: string;
      correlationId: string;
      traceContext?: TraceContextCarrier;
    }) {
      return runActivity('confirm-order', input.correlationId, input.traceContext, async () => {
        const result = await prisma.order.updateMany({
          where: { id: input.orderId, status: 'PENDING' },
          data: { status: 'CONFIRMED' },
        });
        if (result.count === 0) {
          const order = await prisma.order.findUnique({ where: { id: input.orderId } });
          if (!order || order.status !== 'CONFIRMED') {
            permanentFailure('Order is missing or no longer pending');
          }
        }
      });
    },

    cancelOrder(input: {
      orderId: string;
      correlationId: string;
      traceContext?: TraceContextCarrier;
    }) {
      return runActivity('cancel-order', input.correlationId, input.traceContext, async () => {
        const result = await prisma.order.updateMany({
          where: { id: input.orderId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        if (result.count === 0) {
          const order = await prisma.order.findUnique({ where: { id: input.orderId } });
          if (!order || order.status !== 'CANCELLED') {
            permanentFailure('Order is missing or cannot be cancelled');
          }
        }
      });
    },
  };
}
