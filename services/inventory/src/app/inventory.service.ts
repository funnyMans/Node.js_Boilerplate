import { createHash } from 'node:crypto';

export type ReservationItemInput = { productId: string; quantity: number };
export type ReservationResult = { status: 'reserved'; reservationId: string };
export type AdjustmentResult = { adjustmentId: string; productId: string; stock: number };

export interface InventoryRepository {
  reserve(orderId: string, items: ReservationItemInput[]): Promise<ReservationResult>;
  adjust(
    idempotencyKey: string,
    productId: string,
    quantity: number,
    requestPayload: string
  ): Promise<AdjustmentResult>;
  getReservation(orderId: string): Promise<ReservationResult | null>;
  getStock(productId: string): Promise<{ productId: string; stock: number } | null>;
}

export class InventoryConflictError extends Error {
  readonly statusCode = 409;
}

export class InventoryNotFoundError extends Error {
  readonly statusCode = 404;
}

function normalizeItems(items: ReservationItemInput[]): ReservationItemInput[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || !item.productId) {
      throw new InventoryConflictError('Each quantity must be a positive integer');
    }
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  if (quantities.size === 0) throw new InventoryConflictError('At least one item is required');
  return [...quantities]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
}

export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  reserve(orderId: string, items: ReservationItemInput[]) {
    if (!orderId) throw new InventoryConflictError('orderId is required');
    return this.repository.reserve(orderId, normalizeItems(items));
  }

  adjust(idempotencyKey: string, productId: string, quantity: number) {
    if (!idempotencyKey) throw new InventoryConflictError('Idempotency-Key is required');
    if (!productId) throw new InventoryConflictError('productId is required');
    if (!Number.isSafeInteger(quantity) || quantity === 0) {
      throw new InventoryConflictError('quantity must be a nonzero integer');
    }
    const requestPayload = JSON.stringify({ productId, quantity });
    return this.repository.adjust(
      idempotencyKey,
      productId,
      quantity,
      createHash('sha256').update(requestPayload).digest('hex') + ':' + requestPayload
    );
  }

  getReservation(orderId: string) {
    return this.repository.getReservation(orderId);
  }

  getStock(productId: string) {
    return this.repository.getStock(productId);
  }
}
