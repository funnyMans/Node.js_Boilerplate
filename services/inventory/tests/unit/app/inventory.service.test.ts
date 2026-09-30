import { describe, expect, it } from 'vitest';
import {
  InventoryConflictError,
  InventoryRepository,
  InventoryService,
  ReservationItemInput,
} from '../../../src/app/inventory.service';

class FakeInventoryRepository implements InventoryRepository {
  readonly stock = new Map([
    ['sku-coffee', 3],
    ['sku-tea', 2],
  ]);
  readonly reservations = new Map<
    string,
    { items: ReservationItemInput[]; reservationId: string }
  >();
  readonly adjustments = new Map<
    string,
    { payload: string; result: { adjustmentId: string; productId: string; stock: number } }
  >();
  private lock = Promise.resolve();

  async reserve(orderId: string, items: ReservationItemInput[]) {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const existing = this.reservations.get(orderId);
      if (existing) {
        if (JSON.stringify(existing.items) !== JSON.stringify(items))
          throw new Error('order payload conflict');
        return { status: 'reserved' as const, reservationId: existing.reservationId };
      }
      if (items.some((item) => !this.stock.has(item.productId))) throw new Error('unknown stock');
      if (items.some((item) => (this.stock.get(item.productId) ?? 0) < item.quantity)) {
        throw new Error('insufficient stock');
      }
      for (const item of items)
        this.stock.set(item.productId, this.stock.get(item.productId)! - item.quantity);
      const result = {
        status: 'reserved' as const,
        reservationId: `reservation-${this.reservations.size + 1}`,
      };
      this.reservations.set(orderId, { items, reservationId: result.reservationId });
      return result;
    } finally {
      release();
    }
  }

  async adjust(
    idempotencyKey: string,
    productId: string,
    quantity: number,
    requestPayload: string
  ) {
    const payload = requestPayload.slice(requestPayload.indexOf(':') + 1);
    const existing = this.adjustments.get(idempotencyKey);
    if (existing) {
      if (existing.payload !== payload) throw new Error('adjustment idempotency conflict');
      return existing.result;
    }
    if (!this.stock.has(productId)) throw new Error('unknown stock');
    const stock = this.stock.get(productId)! + quantity;
    if (stock < 0) throw new Error('insufficient stock');
    this.stock.set(productId, stock);
    const result = { adjustmentId: `adjustment-${this.adjustments.size + 1}`, productId, stock };
    this.adjustments.set(idempotencyKey, { payload, result });
    return result;
  }

  async getReservation(orderId: string) {
    const reservation = this.reservations.get(orderId);
    return reservation
      ? { status: 'reserved' as const, reservationId: reservation.reservationId }
      : null;
  }

  async getStock(productId: string) {
    const stock = this.stock.get(productId);
    return stock === undefined ? null : { productId, stock };
  }
}

describe('InventoryService', () => {
  it('does not partially decrement on an unavailable multi-item reservation', async () => {
    const repository = new FakeInventoryRepository();
    const service = new InventoryService(repository);
    await expect(
      service.reserve('order-1', [
        { productId: 'sku-coffee', quantity: 2 },
        { productId: 'sku-tea', quantity: 3 },
      ])
    ).rejects.toThrow('insufficient stock');
    expect(repository.stock.get('sku-coffee')).toBe(3);
  });

  it('returns the same reservation for duplicate orders and conflicts on changed items', async () => {
    const service = new InventoryService(new FakeInventoryRepository());
    const items = [{ productId: 'sku-coffee', quantity: 1 }];
    const first = await service.reserve('order-1', items);
    expect(await service.reserve('order-1', items)).toEqual(first);
    await expect(
      service.reserve('order-1', [{ productId: 'sku-coffee', quantity: 2 }])
    ).rejects.toThrow('order payload conflict');
  });

  it('serializes concurrent reservations without overselling', async () => {
    const repository = new FakeInventoryRepository();
    const service = new InventoryService(repository);
    const results = await Promise.allSettled([
      service.reserve('order-1', [{ productId: 'sku-coffee', quantity: 2 }]),
      service.reserve('order-2', [{ productId: 'sku-coffee', quantity: 2 }]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(repository.stock.get('sku-coffee')).toBe(1);
  });

  it('keeps stock consistent under a burst of simultaneous reservations', async () => {
    const repository = new FakeInventoryRepository();
    const service = new InventoryService(repository);
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, index) =>
        service.reserve(`stress-order-${index}`, [{ productId: 'sku-coffee', quantity: 1 }])
      )
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    expect(repository.stock.get('sku-coffee')).toBe(0);
    expect(repository.reservations.size).toBe(3);
  });

  it('makes adjustments idempotent and rejects negative resulting stock', async () => {
    const repository = new FakeInventoryRepository();
    const service = new InventoryService(repository);
    const first = await service.adjust('adjust-1', 'sku-tea', 2);
    expect(await service.adjust('adjust-1', 'sku-tea', 2)).toEqual(first);
    await expect(service.adjust('adjust-1', 'sku-tea', 3)).rejects.toThrow('idempotency conflict');
    await expect(service.adjust('adjust-2', 'sku-tea', -10)).rejects.toThrow('insufficient stock');
  });

  it('rejects invalid quantities before reaching the repository', async () => {
    const service = new InventoryService(new FakeInventoryRepository());
    expect(() => service.adjust('key', 'sku-tea', 0)).toThrow(InventoryConflictError);
    expect(() => service.reserve('order', [{ productId: 'sku-tea', quantity: 0 }])).toThrow(
      InventoryConflictError
    );
  });
});
