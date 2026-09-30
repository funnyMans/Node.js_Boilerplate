import type { OrderItemDto } from '@app/contracts';
import type { TraceContextCarrier } from '@app/common';

export type OrderFulfillmentInput = {
  orderId: string;
  userId: string;
  items: OrderItemDto[];
  correlationId: string;
  traceContext?: TraceContextCarrier;
};

export type ChargePaymentResult = { status: 'charged'; paymentId: string } | { status: 'declined' };

export type ReserveInventoryResult =
  { status: 'reserved'; reservationId: string } | { status: 'unavailable' };

export interface OrderFulfillmentActivities {
  chargePayment(input: OrderFulfillmentInput): Promise<ChargePaymentResult>;
  reserveInventory(input: OrderFulfillmentInput): Promise<ReserveInventoryResult>;
  refundPayment(input: {
    orderId: string;
    paymentId: string;
    correlationId: string;
    traceContext?: TraceContextCarrier;
  }): Promise<{ status: 'refunded' }>;
  confirmOrder(input: {
    orderId: string;
    correlationId: string;
    traceContext?: TraceContextCarrier;
  }): Promise<void>;
  cancelOrder(input: {
    orderId: string;
    correlationId: string;
    traceContext?: TraceContextCarrier;
  }): Promise<void>;
}
