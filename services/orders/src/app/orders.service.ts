import { createDomainEvent, eventTypes } from '@app/contracts';
import type { TraceContextCarrier } from '@app/common';
import type { CreateOrderRequest, OrderDto, OrderItemDto } from '@app/contracts';
import type { OrderStatus as PrismaOrderStatus, PrismaClient } from '../../generated/prisma/client';

const orderStatuses: Record<PrismaOrderStatus, OrderDto['status']> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  FULFILLED: 'fulfilled',
};

function toOrderDto(order: {
  id: string;
  userId: string;
  status: PrismaOrderStatus;
  items: Array<{ productId: string; quantity: number }>;
  createdAt: Date;
  updatedAt: Date;
}): OrderDto {
  return {
    id: order.id,
    userId: order.userId,
    status: orderStatuses[order.status],
    items: order.items.map(({ productId, quantity }) => ({ productId, quantity })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    userId: string,
    request: CreateOrderRequest,
    correlationId: string,
    traceContext?: TraceContextCarrier
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.create({
        data: {
          userId,
          items: {
            create: request.items.map((item: OrderItemDto) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      const event = createDomainEvent({
        eventType: eventTypes.orderCreated,
        sourceService: 'orders-service',
        correlationId,
        payload: {
          orderId: order.id,
          userId,
          items: request.items,
        },
      });

      await transaction.outboxEvent.create({
        data: {
          subject: 'orders.order.created',
          payload: JSON.parse(JSON.stringify(event)),
          ...(traceContext ? { traceContext } : {}),
        },
      });

      return toOrderDto(order);
    });
  }

  async getForUser(id: string, userId: string): Promise<OrderDto | null> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });

    return order ? toOrderDto(order) : null;
  }

  async listForUser(userId: string, limit: number): Promise<OrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    });

    return orders.map(toOrderDto);
  }
}
