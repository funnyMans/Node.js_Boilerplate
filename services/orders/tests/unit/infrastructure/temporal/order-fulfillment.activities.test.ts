import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../../src/generated/prisma/client';
import type { OrderFulfillmentInput } from '../../../../src/workflows/order-fulfillment.types';
import { createOrderFulfillmentActivities } from '../../../../src/infrastructure/temporal/order-fulfillment.activities';

const input: OrderFulfillmentInput = {
  orderId: 'fd924839-1bab-4d77-a040-4a08d1754c7d',
  userId: 'user-1',
  items: [{ productId: 'sku-1', quantity: 2 }],
  correlationId: 'corr-1',
  traceContext: {
    traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
  },
};

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function createActivities(fetcher: typeof globalThis.fetch) {
  return createOrderFulfillmentActivities({
    prisma: {} as PrismaClient,
    paymentServiceUrl: 'http://payments.internal',
    inventoryServiceUrl: 'http://inventory.internal',
    serviceToServiceToken: 'test-service-to-service-token-at-least-32',
    fetch: fetcher,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    } as never,
  });
}

describe('order fulfillment activities', () => {
  it('uses an idempotency key for payment charge requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: 'charged', paymentId: 'pay-1' }));
    const activities = createActivities(fetcher);

    await expect(activities.chargePayment(input)).resolves.toEqual({
      status: 'charged',
      paymentId: 'pay-1',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://payments.internal/payments/charges',
      expect.objectContaining({
        headers: expect.objectContaining({
          'idempotency-key': `order:${input.orderId}:charge`,
          'x-service-token': 'test-service-to-service-token-at-least-32',
          'x-correlation-id': input.correlationId,
          traceparent: input.traceContext?.traceparent,
        }),
        body: JSON.stringify({
          orderId: input.orderId,
          userId: input.userId,
          items: input.items,
        }),
      })
    );
  });

  it('maps payment and inventory business conflicts to workflow outcomes', async () => {
    const paymentActivities = createActivities(vi.fn().mockResolvedValue(response({}, 402)));
    await expect(paymentActivities.chargePayment(input)).resolves.toEqual({ status: 'declined' });

    const inventoryActivities = createActivities(vi.fn().mockResolvedValue(response({}, 409)));
    await expect(inventoryActivities.reserveInventory(input)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('fails permanently when an external service violates the response contract', async () => {
    const activities = createActivities(vi.fn().mockResolvedValue(response({ status: 'unknown' })));

    await expect(activities.chargePayment(input)).rejects.toMatchObject({
      nonRetryable: true,
      type: 'ExternalContractError',
    });
  });

  it('fails permanently when an external service returns malformed JSON', async () => {
    const activities = createActivities(
      vi.fn().mockResolvedValue(
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    await expect(activities.chargePayment(input)).rejects.toMatchObject({
      nonRetryable: true,
      type: 'ExternalContractError',
    });
  });

  it('leaves transient service failures retryable', async () => {
    const activities = createActivities(
      vi.fn().mockResolvedValue(response({ message: 'temporarily unavailable' }, 503))
    );

    await expect(activities.chargePayment(input)).rejects.toThrow('External service returned 503');
  });
});
