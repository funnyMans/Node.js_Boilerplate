import type { PrismaClient } from '../../../generated/prisma/client';
import type {
  CatalogProduct,
  CustomerMapping,
  PaymentRecord,
  PaymentRepository,
} from '../../app/payment-service';

function toCustomerMapping(record: {
  userId: string;
  stripeCustomerId: string;
  defaultPaymentMethodId: string | null;
}): CustomerMapping {
  return {
    userId: record.userId,
    stripeCustomerId: record.stripeCustomerId,
    defaultPaymentMethodId: record.defaultPaymentMethodId,
  };
}

function toPaymentRecord(record: {
  id: string;
  orderId: string;
  userId: string;
  amountCents: number;
  currency: string;
  requestFingerprint: string;
  status: PaymentRecord['status'];
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
}): PaymentRecord {
  return {
    id: record.id,
    orderId: record.orderId,
    userId: record.userId,
    amountCents: record.amountCents,
    currency: record.currency,
    requestFingerprint: record.requestFingerprint,
    status: record.status,
    stripePaymentIntentId: record.stripePaymentIntentId,
    stripeRefundId: record.stripeRefundId,
  };
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getCatalogProducts(ids: string[]): Promise<CatalogProduct[]> {
    const products = await this.prisma.catalogProduct.findMany({
      where: { id: { in: ids } },
    });

    return products.map((product) => ({
      id: product.id,
      amountCents: product.amountCents,
      currency: product.currency,
      active: product.active,
    }));
  }

  async getCustomer(userId: string): Promise<CustomerMapping | null> {
    const customer = await this.prisma.paymentCustomer.findUnique({ where: { userId } });
    return customer ? toCustomerMapping(customer) : null;
  }

  async saveCustomer(userId: string, stripeCustomerId: string): Promise<CustomerMapping> {
    const customer = await this.prisma.paymentCustomer.upsert({
      where: { userId },
      create: { userId, stripeCustomerId },
      update: { stripeCustomerId },
    });

    return toCustomerMapping(customer);
  }

  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
    await this.prisma.paymentCustomer.update({
      where: { userId },
      data: { defaultPaymentMethodId: paymentMethodId },
    });
  }

  async findOrCreatePayment(
    input: Omit<PaymentRecord, 'id' | 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>
  ): Promise<PaymentRecord> {
    const payment = await this.prisma.orderPayment.upsert({
      where: { orderId: input.orderId },
      create: {
        orderId: input.orderId,
        userId: input.userId,
        amountCents: input.amountCents,
        currency: input.currency,
        requestFingerprint: input.requestFingerprint,
      },
      update: {},
    });

    return toPaymentRecord(payment);
  }

  async updatePayment(
    id: string,
    update: Partial<Pick<PaymentRecord, 'status' | 'stripePaymentIntentId' | 'stripeRefundId'>>
  ): Promise<PaymentRecord> {
    const updated = await this.prisma.orderPayment.update({
      where: { id },
      data: {
        ...(update.status !== undefined ? { status: update.status } : {}),
        ...(update.stripePaymentIntentId !== undefined
          ? { stripePaymentIntentId: update.stripePaymentIntentId }
          : {}),
        ...(update.stripeRefundId !== undefined ? { stripeRefundId: update.stripeRefundId } : {}),
      },
    });

    return toPaymentRecord(updated);
  }

  async findPayment(orderId: string, paymentId: string): Promise<PaymentRecord | null> {
    const payment = await this.prisma.orderPayment.findUnique({ where: { orderId } });
    if (!payment || payment.id !== paymentId) {
      return null;
    }

    return toPaymentRecord(payment);
  }
}
