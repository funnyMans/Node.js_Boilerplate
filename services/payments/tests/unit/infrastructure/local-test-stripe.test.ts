import { describe, expect, it } from 'vitest';
import { LocalTestStripe } from '../../../src/infrastructure/local-test-stripe';

describe('LocalTestStripe', () => {
  it('supports the payment setup, charge, and refund lifecycle with stable retry results', async () => {
    const stripe = new LocalTestStripe();
    const customer = await stripe.createCustomer('user-1');
    const intent = await stripe.createSetupIntent(customer.id, 'user:user-1:setup');
    const details = await stripe.retrieveSetupIntent(intent.id);

    expect(details).toMatchObject({
      customer: customer.id,
      status: 'succeeded',
      payment_method: expect.stringMatching(/^pm_test_/),
    });
    expect(await stripe.createSetupIntent(customer.id, 'user:user-1:setup')).toEqual(intent);
    const paymentMethodId = details.payment_method;
    if (typeof paymentMethodId !== 'string') {
      throw new Error('Local setup intent did not return a payment method ID');
    }

    const paymentInput = {
      amount: 1299,
      currency: 'usd',
      customerId: customer.id,
      paymentMethodId,
      orderId: 'order-1',
      idempotencyKey: 'order:order-1:charge',
    };
    const payment = await stripe.createAndConfirmPaymentIntent(paymentInput);
    expect(payment.status).toBe('succeeded');
    expect(await stripe.createAndConfirmPaymentIntent(paymentInput)).toEqual(payment);

    const refundInput = {
      paymentIntentId: payment.id,
      orderId: paymentInput.orderId,
      idempotencyKey: 'order:order-1:refund',
    };
    const refund = await stripe.createRefund(refundInput);
    expect(refund.status).toBe('succeeded');
    expect(await stripe.createRefund(refundInput)).toEqual(refund);
  });

  it('rejects unknown setup intents and non-test identifiers', async () => {
    const stripe = new LocalTestStripe();

    await expect(stripe.retrieveSetupIntent('missing')).rejects.toThrow(
      'Unknown local test setup intent'
    );
    await expect(
      stripe.createAndConfirmPaymentIntent({
        amount: 100,
        currency: 'usd',
        customerId: 'cus_live',
        paymentMethodId: 'pm_live',
        orderId: 'order-1',
        idempotencyKey: 'order:order-1:charge',
      })
    ).rejects.toThrow('A local test customer and payment method are required');
  });
});
