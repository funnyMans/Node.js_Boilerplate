import { proxyActivities } from '@temporalio/workflow';
import type { OrderFulfillmentActivities, OrderFulfillmentInput } from './order-fulfillment.types';

const orderActivities = proxyActivities<OrderFulfillmentActivities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '1 minute',
    backoffCoefficient: 2,
  },
});

export async function OrderFulfillmentWorkflow(input: OrderFulfillmentInput) {
  const payment = await orderActivities.chargePayment(input);
  if (payment.status === 'declined') {
    await orderActivities.cancelOrder({
      orderId: input.orderId,
      correlationId: input.correlationId,
      traceContext: input.traceContext,
    });
    return { status: 'cancelled' as const, reason: 'payment_declined' as const };
  }

  const inventory = await orderActivities.reserveInventory(input);
  if (inventory.status === 'unavailable') {
    await orderActivities.refundPayment({
      orderId: input.orderId,
      paymentId: payment.paymentId,
      correlationId: input.correlationId,
      traceContext: input.traceContext,
    });
    await orderActivities.cancelOrder({
      orderId: input.orderId,
      correlationId: input.correlationId,
      traceContext: input.traceContext,
    });
    return { status: 'cancelled' as const, reason: 'inventory_unavailable' as const };
  }

  await orderActivities.confirmOrder({
    orderId: input.orderId,
    correlationId: input.correlationId,
    traceContext: input.traceContext,
  });
  return { status: 'confirmed' as const, paymentId: payment.paymentId };
}
