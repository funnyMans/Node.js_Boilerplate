import { createHash } from 'node:crypto';
import type {
  StripePort,
  StripeRefund,
  StripeSetupIntent,
  StripeSetupIntentDetails,
  StripePaymentIntent,
} from '../app/payment-service';

function stableId(prefix: string, key: string): string {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}

export class LocalTestStripe implements StripePort {
  private readonly setupIntents = new Map<string, StripeSetupIntentDetails>();
  private readonly customersByUser = new Map<string, string>();
  private readonly setupIntentIdsByKey = new Map<string, string>();
  private readonly paymentMethodsByCustomer = new Map<string, string>();

  async createCustomer(userId: string) {
    let customerId = this.customersByUser.get(userId);
    if (!customerId) {
      customerId = stableId('cus_test', userId);
      this.customersByUser.set(userId, customerId);
    }
    return { id: customerId };
  }

  async createSetupIntent(customerId: string, idempotencyKey: string): Promise<StripeSetupIntent> {
    let id = this.setupIntentIdsByKey.get(idempotencyKey);
    if (!id) {
      id = stableId('seti_test', idempotencyKey);
      this.setupIntentIdsByKey.set(idempotencyKey, id);
    }

    const paymentMethodId = stableId('pm_test', customerId);
    this.paymentMethodsByCustomer.set(customerId, paymentMethodId);
    this.setupIntents.set(id, {
      id,
      client_secret: `${id}_secret_test`,
      customer: customerId,
      status: 'succeeded',
      payment_method: paymentMethodId,
    });

    return { id, client_secret: `${id}_secret_test` };
  }

  async retrieveSetupIntent(id: string): Promise<StripeSetupIntentDetails> {
    const intent = this.setupIntents.get(id);
    if (!intent) throw new Error('Unknown local test setup intent');
    return intent;
  }

  async setCustomerDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    if (
      !customerId.startsWith('cus_test_') ||
      this.paymentMethodsByCustomer.get(customerId) !== paymentMethodId
    ) {
      throw new Error('Invalid local test payment method');
    }
  }

  async createAndConfirmPaymentIntent(input: {
    amount: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<StripePaymentIntent> {
    if (
      !input.customerId.startsWith('cus_test_') ||
      this.paymentMethodsByCustomer.get(input.customerId) !== input.paymentMethodId
    ) {
      throw new Error('A local test customer and payment method are required');
    }
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount <= 0 ||
      input.currency.toLowerCase() !== 'usd'
    ) {
      throw new Error('The local test payment requires a positive USD amount');
    }
    if (input.idempotencyKey !== `order:${input.orderId}:charge`) {
      throw new Error('The local test payment requires the order charge idempotency key');
    }
    const id = stableId('pi_test', input.idempotencyKey);
    return { id, status: 'succeeded' };
  }

  async createRefund(input: {
    paymentIntentId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<StripeRefund> {
    if (input.paymentIntentId !== stableId('pi_test', `order:${input.orderId}:charge`)) {
      throw new Error('A local test payment intent is required');
    }
    return {
      id: stableId('re_test', `${input.idempotencyKey}:${input.orderId}`),
      status: 'succeeded',
    };
  }

  isCardDecline(): boolean {
    return false;
  }
}
