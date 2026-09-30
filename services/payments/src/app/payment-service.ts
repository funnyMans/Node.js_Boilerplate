import { createHash } from 'node:crypto';
import { PaymentServiceError } from './errors';

export type Item = { productId: string; quantity: number };
export type CatalogProduct = { id: string; amountCents: number; currency: string; active: boolean };
export type CustomerMapping = {
  userId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string | null;
};
export type PaymentRecord = {
  id: string;
  orderId: string;
  userId: string;
  amountCents: number;
  currency: string;
  requestFingerprint: string;
  status: 'PENDING' | 'CHARGED' | 'DECLINED' | 'REFUND_PENDING' | 'REFUNDED';
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
};

export type StripeSetupIntent = {
  id: string;
  client_secret: string | null;
};

export type StripeSetupIntentDetails = StripeSetupIntent & {
  customer: string | { id: string } | null;
  status: string;
  payment_method: string | { id: string } | null;
};

export type StripePaymentIntent = { id: string; status: string };
export type StripeRefund = { id: string; status: string | null };

export interface PaymentRepository {
  getCatalogProducts(ids: string[]): Promise<CatalogProduct[]>;
  getCustomer(userId: string): Promise<CustomerMapping | null>;
  saveCustomer(userId: string, stripeCustomerId: string): Promise<CustomerMapping>;
  setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void>;
  findOrCreatePayment(
    input: Omit<PaymentRecord, 'id' | 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>
  ): Promise<PaymentRecord>;
  updatePayment(
    id: string,
    update: Partial<Pick<PaymentRecord, 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>>
  ): Promise<PaymentRecord>;
  findPayment(orderId: string, paymentId: string): Promise<PaymentRecord | null>;
}

export interface StripePort {
  createCustomer(userId: string): Promise<{ id: string }>;
  createSetupIntent(customerId: string, idempotencyKey: string): Promise<StripeSetupIntent>;
  retrieveSetupIntent(id: string): Promise<StripeSetupIntentDetails>;
  setCustomerDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  createAndConfirmPaymentIntent(input: {
    amount: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<StripePaymentIntent>;
  createRefund(input: {
    paymentIntentId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<StripeRefund>;
  isCardDecline(error: unknown): boolean;
}

const MAX_CHARGE_CENTS = 99_999_999;

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly stripe: StripePort
  ) {}

  async createSetupIntent(userId: string) {
    let customer = await this.repository.getCustomer(userId);
    if (!customer) {
      const stripeCustomer = await this.stripe.createCustomer(userId);
      customer = await this.repository.saveCustomer(userId, stripeCustomer.id);
    }
    const intent = await this.stripe.createSetupIntent(
      customer.stripeCustomerId,
      `user:${userId}:setup`
    );
    if (!intent.client_secret) throw new Error('Stripe did not return a SetupIntent client secret');
    return { setupIntentId: intent.id, clientSecret: intent.client_secret };
  }

  async selectDefaultPaymentMethod(userId: string, setupIntentId: string) {
    const customer = await this.repository.getCustomer(userId);
    if (!customer) throw new PaymentServiceError('Payment setup not found', 404, 'setup_not_found');
    const intent = await this.stripe.retrieveSetupIntent(setupIntentId);
    const intentCustomer =
      typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
    if (intentCustomer !== customer.stripeCustomerId) {
      throw new PaymentServiceError(
        'SetupIntent does not belong to this user',
        403,
        'setup_owner_mismatch'
      );
    }
    if (intent.status !== 'succeeded') {
      throw new PaymentServiceError('SetupIntent has not succeeded', 409, 'setup_not_succeeded');
    }
    const paymentMethodId =
      typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id;
    if (!paymentMethodId) {
      throw new PaymentServiceError(
        'SetupIntent has no payment method',
        409,
        'payment_method_missing'
      );
    }
    await this.stripe.setCustomerDefaultPaymentMethod(customer.stripeCustomerId, paymentMethodId);
    await this.repository.setDefaultPaymentMethod(userId, paymentMethodId);
    return { status: 'selected' as const };
  }

  async charge(input: { orderId: string; userId: string; items: Item[] }) {
    const customer = await this.repository.getCustomer(input.userId);
    if (!customer?.defaultPaymentMethodId) {
      throw new PaymentServiceError(
        'No default payment method is configured',
        409,
        'default_payment_method_missing'
      );
    }

    const quantities = new Map<string, number>();
    for (const item of input.items) {
      const quantity = (quantities.get(item.productId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > 10_000) {
        throw new PaymentServiceError(
          'Item quantity exceeds the allowed limit',
          400,
          'invalid_quantity'
        );
      }
      quantities.set(item.productId, quantity);
    }

    const products = await this.repository.getCatalogProducts([...quantities.keys()]);
    if (products.length !== quantities.size || products.some((product) => !product.active)) {
      throw new PaymentServiceError('One or more products are unavailable', 422, 'unknown_product');
    }
    const currencies = new Set(products.map((product) => product.currency.toLowerCase()));
    if (currencies.size !== 1) {
      throw new PaymentServiceError(
        'Catalog currency configuration is inconsistent',
        500,
        'catalog_currency_mismatch'
      );
    }

    let amountCents = 0;
    for (const product of products) {
      const lineTotal = product.amountCents * (quantities.get(product.id) ?? 0);
      amountCents += lineTotal;
      if (
        !Number.isSafeInteger(lineTotal) ||
        !Number.isSafeInteger(amountCents) ||
        amountCents > MAX_CHARGE_CENTS
      ) {
        throw new PaymentServiceError(
          'Order total exceeds the supported amount',
          400,
          'amount_too_large'
        );
      }
    }
    if (amountCents <= 0)
      throw new PaymentServiceError('Order total must be positive', 400, 'invalid_amount');

    const normalizedItems = [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b));
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ userId: input.userId, items: normalizedItems, amountCents }))
      .digest('hex');
    const payment = await this.repository.findOrCreatePayment({
      orderId: input.orderId,
      userId: input.userId,
      amountCents,
      currency: [...currencies][0],
      requestFingerprint: fingerprint,
    });
    if (payment.userId !== input.userId || payment.requestFingerprint !== fingerprint) {
      throw new PaymentServiceError(
        'Order payment already exists with different details',
        409,
        'payment_conflict'
      );
    }
    if (
      payment.status === 'CHARGED' ||
      payment.status === 'REFUND_PENDING' ||
      payment.status === 'REFUNDED'
    ) {
      return { status: 'charged' as const, paymentId: payment.id };
    }
    if (payment.status === 'DECLINED') return { status: 'declined' as const };

    try {
      const intent = await this.stripe.createAndConfirmPaymentIntent({
        amount: payment.amountCents,
        currency: payment.currency,
        customerId: customer.stripeCustomerId,
        paymentMethodId: customer.defaultPaymentMethodId,
        orderId: payment.orderId,
        idempotencyKey: `order:${payment.orderId}:charge`,
      });
      if (intent.status !== 'succeeded') {
        if (intent.status === 'requires_payment_method') {
          await this.repository.updatePayment(payment.id, {
            status: 'DECLINED',
            stripePaymentIntentId: intent.id,
          });
          return { status: 'declined' as const };
        }
        throw new Error(`PaymentIntent did not succeed (status: ${intent.status})`);
      }
      await this.repository.updatePayment(payment.id, {
        status: 'CHARGED',
        stripePaymentIntentId: intent.id,
      });
      return { status: 'charged' as const, paymentId: payment.id };
    } catch (error) {
      if (this.stripe.isCardDecline(error)) {
        await this.repository.updatePayment(payment.id, { status: 'DECLINED' });
        return { status: 'declined' as const };
      }
      throw error;
    }
  }

  async refund(input: { orderId: string; paymentId: string }) {
    const payment = await this.repository.findPayment(input.orderId, input.paymentId);
    if (!payment)
      throw new PaymentServiceError('Payment not found for this order', 404, 'payment_not_found');
    if (payment.status === 'REFUNDED') return { status: 'refunded' as const };
    if (payment.status !== 'CHARGED' && payment.status !== 'REFUND_PENDING') {
      throw new PaymentServiceError(
        'Payment is not eligible for refund',
        409,
        'payment_not_refundable'
      );
    }
    if (!payment.stripePaymentIntentId) {
      throw new PaymentServiceError(
        'Payment provider reference is missing',
        502,
        'provider_reference_missing'
      );
    }

    await this.repository.updatePayment(payment.id, { status: 'REFUND_PENDING' });
    const refund = await this.stripe.createRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      orderId: payment.orderId,
      idempotencyKey: `order:${payment.orderId}:refund`,
    });
    if (refund.status !== 'succeeded') {
      throw new Error(`Stripe refund is not complete (status: ${refund.status ?? 'unknown'})`);
    }
    await this.repository.updatePayment(payment.id, {
      status: 'REFUNDED',
      stripeRefundId: refund.id,
    });
    return { status: 'refunded' as const };
  }
}
