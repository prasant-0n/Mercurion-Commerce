import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

describe("postgres schema contract", () => {
  const client = new Client({
    connectionString: databaseUrl
  });

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error("TEST_DATABASE_URL or DATABASE_URL must be configured");
    }

    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("uses citext for user emails", async () => {
    const result = await client.query<{
      data_type: string;
      udt_name: string;
    }>(
      `
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'email'
      `
    );

    expect(result.rows[0]?.udt_name).toBe("citext");
  });

  it("uses inet for refresh token ip addresses", async () => {
    const result = await client.query<{
      data_type: string;
      udt_name: string;
    }>(
      `
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'ip_address'
      `
    );

    expect(result.rows[0]?.udt_name).toBe("inet");
  });

  it("creates the expected check constraints", async () => {
    const result = await client.query<{ conname: string }>(
      `
        SELECT conname
        FROM pg_constraint
        WHERE conname IN (
          'inventory_items_on_hand_qty_check',
          'inventory_items_reserved_qty_check',
          'inventory_items_reserved_lte_on_hand_check',
          'inventory_reservations_quantity_check',
          'order_items_quantity_check'
        )
      `
    );

    expect(result.rows.map((row) => row.conname).sort()).toEqual([
      "inventory_items_on_hand_qty_check",
      "inventory_items_reserved_lte_on_hand_check",
      "inventory_items_reserved_qty_check",
      "inventory_reservations_quantity_check",
      "order_items_quantity_check"
    ]);
  });

  it("creates the partial hot-path indexes", async () => {
    const inventoryReservationIndex = await loadIndexDefinition(
      client,
      "idx_inventory_reservations_expiry"
    );
    const outboxIndex = await loadIndexDefinition(client, "idx_outbox_pending");

    expect(inventoryReservationIndex).toMatch(/where/i);
    expect(inventoryReservationIndex).toMatch(/status/i);
    expect(inventoryReservationIndex).toMatch(/PENDING/i);

    expect(outboxIndex).toMatch(/where/i);
    expect(outboxIndex).toMatch(/status/i);
    expect(outboxIndex).toMatch(/PENDING/i);
  });

  it("uses provider-scoped uniqueness for provider payment ids", async () => {
    const indexDefinition = await loadIndexDefinition(
      client,
      "payment_attempts_provider_provider_payment_id_key"
    );

    expect(indexDefinition).toMatch(/unique/i);
    expect(indexDefinition).toMatch(/\(provider, provider_payment_id\)/i);
  });
});

const loadIndexDefinition = async (client: Client, indexName: string) => {
  const result = await client.query<{ indexdef: string }>(
    `
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = $1
    `,
    [indexName]
  );

  return result.rows[0]?.indexdef ?? "";
};
