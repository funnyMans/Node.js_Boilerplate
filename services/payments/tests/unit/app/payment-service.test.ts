import { describe, expect, it } from 'vitest';
import {
  PaymentService,
  type CustomerMapping,
  type PaymentRecord,
  type PaymentRepository,
  type StripePort,
} from '../../../src/app/payment-service';

class FakePaymentRepository implements PaymentRepository {
  readonly products = new Map([
    ['sku-coffee', { id: 'sku-coffee', amountCents: 1299, currency: 'usd', active: true }],
  ]);
  readonly payments = new Map<string, PaymentRecord>();
  customer: CustomerMapping = {
    userId: 'user-1',
    stripeCustomerId: 'cus-1',
    defaultPaymentMethodId: 'pm-1',
  };

  async getCatalogProducts(ids: string[]) {
    return ids.flatMap((id) => {
      const product = this.products.get(id);
      return product ? [product] : [];
    });
  }

  async getCustomer() {
    return this.customer;
  }

  async saveCustomer(userId: string, stripeCustomerId: string) {
    this.customer = { userId, stripeCustomerId, defaultPaymentMethodId: null };
    return this.customer;
  }

  async setDefaultPaymentMethod(_userId: string, paymentMethodId: string) {
    this.customer.defaultPaymentMethodId = paymentMethodId;
  }

  async findOrCreatePayment(
    input: Omit<PaymentRecord, 'id' | 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>
  ) {
    const existing = this.payments.get(input.orderId);
    if (existing) return existing;

    const payment: PaymentRecord = {
      ...input,
      id: `payment-${input.orderId}`,
      status: 'PENDING',
      stripePaymentIntentId: null,
      stripeRefundId: null,
    };
    this.payments.set(input.orderId, payment);
    return payment;
  }

  async updatePayment(
    id: string,
    update: Partial<Pick<PaymentRecord, 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>>
  ) {
    const payment = [...this.payments.values()].find((item) => item.id === id);
    if (!payment) throw new Error('payment not found');
    Object.assign(payment, update);
    return payment;
  }

  async findPayment(orderId: string, paymentId: string) {
    const payment = this.payments.get(orderId);
    return payment?.id === paymentId ? payment : null;
  }
}

class FakeStripe implements StripePort {
  readonly charges: Array<{ amount: number; idempotencyKey: string }> = [];

  async createCustomer(userId: string) {
    return { id: `cus-${userId}` };
  }

  async createSetupIntent() {
    return { id: 'seti-1', client_secret: 'seti-secret' };
  }

  async retrieveSetupIntent() {
    return {
      id: 'seti-1',
      client_secret: 'seti-secret',
      customer: 'cus-user-1',
      status: 'succeeded',
      payment_method: 'pm-1',
    };
  }

  async setCustomerDefaultPaymentMethod() {}

  async createAndConfirmPaymentIntent(input: {
    amount: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    orderId: string;
    idempotencyKey: string;
  }) {
    this.charges.push({ amount: input.amount, idempotencyKey: input.idempotencyKey });
    return { id: `pi-${input.orderId}`, status: 'succeeded' };
  }

  async createRefund(input: { paymentIntentId: string; orderId: string; idempotencyKey: string }) {
    return { id: `refund-${input.orderId}`, status: 'succeeded' };
  }

  isCardDecline() {
    return false;
  }
}

describe('PaymentService', () => {
  it('calculates charges from the payment-owned catalog', async () => {
    const stripe = new FakeStripe();
    const service = new PaymentService(new FakePaymentRepository(), stripe);

    const result = await service.charge({
      orderId: 'order-1',
      userId: 'user-1',
      items: [{ productId: 'sku-coffee', quantity: 2 }],
    });

    expect(result).toEqual({ status: 'charged', paymentId: 'payment-order-1' });
    expect(stripe.charges[0]?.amount).toBe(2598);
  });

  it('rejects an order replay if the requested items change', async () => {
    const service = new PaymentService(new FakePaymentRepository(), new FakeStripe());

    await service.charge({
      orderId: 'order-1',
      userId: 'user-1',
      items: [{ productId: 'sku-coffee', quantity: 1 }],
    });

    await expect(
      service.charge({
        orderId: 'order-1',
        userId: 'user-1',
        items: [{ productId: 'sku-coffee', quantity: 2 }],
      })
    ).rejects.toMatchObject({ statusCode: 409, code: 'payment_conflict' });
  });

  it('uses a stable Stripe idempotency key across concurrent retries', async () => {
    const stripe = new FakeStripe();
    const service = new PaymentService(new FakePaymentRepository(), stripe);
    const input = {
      orderId: 'order-burst',
      userId: 'user-1',
      items: [{ productId: 'sku-coffee', quantity: 1 }],
    };

    const results = await Promise.all(Array.from({ length: 50 }, () => service.charge(input)));

    expect(results).toHaveLength(50);
    expect(new Set(stripe.charges.map((charge) => charge.idempotencyKey))).toEqual(
      new Set(['order:order-burst:charge'])
    );
    expect(stripe.charges.every((charge) => charge.amount === 1299)).toBe(true);
  });
});
