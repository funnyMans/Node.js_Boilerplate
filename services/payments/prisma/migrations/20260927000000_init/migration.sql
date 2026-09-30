CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CHARGED', 'DECLINED', 'REFUND_PENDING', 'REFUNDED');

CREATE TABLE "catalog_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'usd',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_customers" (
    "user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "default_payment_method_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "order_payments" (
    "id" UUID NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_payment_intent_id" TEXT,
    "stripe_refund_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_customers_stripe_customer_id_key" ON "payment_customers"("stripe_customer_id");
CREATE UNIQUE INDEX "order_payments_order_id_key" ON "order_payments"("order_id");
CREATE UNIQUE INDEX "order_payments_stripe_payment_intent_id_key" ON "order_payments"("stripe_payment_intent_id");
CREATE UNIQUE INDEX "order_payments_stripe_refund_id_key" ON "order_payments"("stripe_refund_id");
CREATE INDEX "order_payments_user_id_created_at_idx" ON "order_payments"("user_id", "created_at");
