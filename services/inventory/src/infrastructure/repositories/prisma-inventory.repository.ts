import type { PrismaClient } from '../../../generated/prisma/client';
import type {
  AdjustmentResult,
  InventoryRepository,
  ReservationItemInput,
  ReservationResult,
} from '../../app/inventory.service';

type LockedProduct = { id: string; stock: number };

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserve(orderId: string, items: ReservationItemInput[]): Promise<ReservationResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reservation.findUnique({
        where: { orderId },
        include: { items: { orderBy: { productId: 'asc' } } },
      });
      if (existing) return this.sameReservation(existing, items);

      const locked: LockedProduct[] = [];
      for (const item of items) {
        const rows = await tx.$queryRaw<LockedProduct[]>`
          SELECT id, stock FROM products WHERE id = ${item.productId} FOR UPDATE
        `;
        locked.push(...rows);
      }
      const ids = items.map((item) => item.productId);
      if (locked.length !== ids.length) throw new Error('unknown stock');
      const stockById = new Map(locked.map((product) => [product.id, product.stock]));
      if (items.some((item) => (stockById.get(item.productId) ?? 0) < item.quantity)) {
        throw new Error('insufficient stock');
      }

      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
      const reservation = await tx.reservation.create({
        data: {
          orderId,
          items: {
            create: items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          },
        },
      });
      return { status: 'reserved' as const, reservationId: reservation.id };
    });
  }

  private async sameReservation(
    reservation: { id: string; items: Array<{ productId: string; quantity: number }> },
    items: ReservationItemInput[]
  ): Promise<ReservationResult> {
    const same =
      reservation.items.length === items.length &&
      reservation.items.every(
        (item, index) =>
          item.productId === items[index]?.productId && item.quantity === items[index]?.quantity
      );
    if (!same) throw new Error('order payload conflict');
    return { status: 'reserved', reservationId: reservation.id };
  }

  async adjust(
    idempotencyKey: string,
    productId: string,
    quantity: number,
    requestPayload: string
  ): Promise<AdjustmentResult> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.stockAdjustment.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          JSON.stringify(existing.requestPayload) !==
          requestPayload.slice(requestPayload.indexOf(':') + 1)
        ) {
          throw new Error('adjustment idempotency conflict');
        }
        return existing.result as unknown as AdjustmentResult;
      }
      const locked = await tx.$queryRaw<LockedProduct[]>`
        SELECT id, stock FROM products WHERE id = ${productId} FOR UPDATE
      `;
      if (locked.length === 0) throw new Error('unknown stock');
      const nextStock = locked[0].stock + quantity;
      if (nextStock < 0) throw new Error('insufficient stock');
      await tx.product.update({ where: { id: productId }, data: { stock: nextStock } });
      const adjustment = await tx.stockAdjustment.create({
        data: {
          idempotencyKey,
          productId,
          quantity,
          requestPayload: JSON.parse(requestPayload.slice(requestPayload.indexOf(':') + 1)),
          result: { adjustmentId: '', productId, stock: nextStock },
        },
      });
      const result = { adjustmentId: adjustment.id, productId, stock: nextStock };
      await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: { result } });
      return result;
    });
  }

  async getReservation(orderId: string): Promise<ReservationResult | null> {
    const reservation = await this.prisma.reservation.findUnique({ where: { orderId } });
    return reservation ? { status: 'reserved', reservationId: reservation.id } : null;
  }

  async getStock(productId: string) {
    return this.prisma.product
      .findUnique({ where: { id: productId }, select: { id: true, stock: true } })
      .then((product) => (product ? { productId: product.id, stock: product.stock } : null));
  }
}
