CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE "users"
ALTER COLUMN "email" TYPE CITEXT USING "email"::CITEXT;

ALTER TABLE "refresh_tokens"
ALTER COLUMN "ip_address" TYPE INET
USING (
  CASE
    WHEN "ip_address" IS NULL OR "ip_address" = '' THEN NULL
    ELSE "ip_address"::INET
  END
);

ALTER TABLE "inventory_items"
ADD CONSTRAINT "inventory_items_on_hand_qty_check" CHECK ("on_hand_qty" >= 0),
ADD CONSTRAINT "inventory_items_reserved_qty_check" CHECK ("reserved_qty" >= 0),
ADD CONSTRAINT "inventory_items_reserved_lte_on_hand_check" CHECK ("reserved_qty" <= "on_hand_qty");

ALTER TABLE "inventory_reservations"
ADD CONSTRAINT "inventory_reservations_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0);

DROP INDEX "idx_inventory_reservations_expiry";
CREATE INDEX "idx_inventory_reservations_expiry"
ON "inventory_reservations" ("expires_at")
WHERE "status" = 'PENDING';

DROP INDEX "idx_outbox_pending";
CREATE INDEX "idx_outbox_pending"
ON "outbox_events" ("status", "created_at")
WHERE "status" = 'PENDING';

DROP INDEX "payment_attempts_provider_payment_id_key";
CREATE UNIQUE INDEX "payment_attempts_provider_provider_payment_id_key"
ON "payment_attempts" ("provider", "provider_payment_id");
