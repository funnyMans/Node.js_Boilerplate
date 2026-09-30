CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "stock" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_stock_nonnegative" CHECK ("stock" >= 0)
);

CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reservation_items" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "reservation_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservation_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "request_payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservations_order_id_key" ON "reservations"("order_id");
CREATE UNIQUE INDEX "reservation_items_reservation_id_product_id_key" ON "reservation_items"("reservation_id", "product_id");
CREATE UNIQUE INDEX "stock_adjustments_idempotency_key_key" ON "stock_adjustments"("idempotency_key");
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservation_items" ADD CONSTRAINT "reservation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON UPDATE CASCADE;

INSERT INTO "products" ("id", "stock", "updated_at") VALUES
  ('sku-coffee', 100, CURRENT_TIMESTAMP),
  ('sku-filter', 100, CURRENT_TIMESTAMP),
  ('sku-tea', 100, CURRENT_TIMESTAMP),
  ('sku-live-export', 25, CURRENT_TIMESTAMP);
