import Stripe from 'stripe';
import type { StripePort } from '../app/payment-service';

export class StripePaymentAdapter implements StripePort {
  constructor(private readonly stripe: Stripe) {}

  async createCustomer(userId: string): Promise<Stripe.Customer> {
    return this.stripe.customers.create({ metadata: { userId } });
  }

  async createSetupIntent(customerId: string, idempotencyKey: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create(
      {
        customer: customerId,
        usage: 'off_session',
        metadata: { customerId },
      },
      { idempotencyKey }
    );
  }

  async retrieveSetupIntent(id: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.retrieve(id);
  }

  async setCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string
  ): Promise<void> {
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  async createAndConfirmPaymentIntent(input: {
    amount: number;
    currency: string;
    customerId: string;
    paymentMethodId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      {
        amount: input.amount,
        currency: input.currency,
        customer: input.customerId,
        payment_method: input.paymentMethodId,
        confirm: true,
        off_session: true,
        confirmation_method: 'manual',
        metadata: { orderId: input.orderId },
      },
      { idempotencyKey: input.idempotencyKey }
    );
  }

  async createRefund(input: {
    paymentIntentId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<Stripe.Refund> {
    return this.stripe.refunds.create(
      {
        payment_intent: input.paymentIntentId,
        metadata: { orderId: input.orderId },
      },
      { idempotencyKey: input.idempotencyKey }
    );
  }

  isCardDecline(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const err = error as {
      type?: string;
      code?: string;
      decline_code?: string;
      raw?: { code?: string };
    };
    const code = err.code ?? err.decline_code ?? err.raw?.code;
    return err.type === 'card_error' || code === 'card_declined' || code === 'insufficient_funds';
  }
}
