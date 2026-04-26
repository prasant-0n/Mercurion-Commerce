import { describe, expect, it, vi } from "vitest";

import type { Cart } from "@/modules/cart/application/ports/cart.repository";
import {
  type CartKeyValueStore,
  RedisCartRepository
} from "@/modules/cart/infrastructure/repositories/redis-cart.repository";

describe("RedisCartRepository", () => {
  it("serializes carts with expiry and refreshes ttl on read", async () => {
    const store = new FakeCartKeyValueStore();
    const now = vi.fn<() => Date>(() => new Date("2026-04-27T10:00:00.000Z"));
    const repository = new RedisCartRepository(store, now);

    const cart = buildCart();
    const persistedCart = await repository.save(cart);

    expect(store.setCalls[0]?.key).toBe("cart:user-1");
    expect(store.setCalls[0]?.ttlSeconds).toBe(30 * 24 * 60 * 60);
    expect(persistedCart.expiresAt.toISOString()).toBe(
      "2026-05-27T10:00:00.000Z"
    );

    now.mockReturnValueOnce(new Date("2026-04-27T10:05:00.000Z"));

    const loadedCart = await repository.getByCustomerId("user-1");

    expect(store.touchCalls[0]).toEqual({
      key: "cart:user-1",
      ttlSeconds: 30 * 24 * 60 * 60
    });
    expect(loadedCart?.expiresAt.toISOString()).toBe(
      "2026-05-27T10:05:00.000Z"
    );
  });
});

class FakeCartKeyValueStore implements CartKeyValueStore {
  readonly payloads = new Map<string, string>();
  readonly setCalls: Array<{
    key: string;
    ttlSeconds: number;
    value: string;
  }> = [];
  readonly touchCalls: Array<{
    key: string;
    ttlSeconds: number;
  }> = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.payloads.get(key) ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.payloads.set(key, value);
    this.setCalls.push({
      key,
      ttlSeconds,
      value
    });

    return Promise.resolve();
  }

  touch(key: string, ttlSeconds: number): Promise<void> {
    this.touchCalls.push({
      key,
      ttlSeconds
    });

    return Promise.resolve();
  }
}

const buildCart = (): Cart => ({
  customerId: "user-1",
  expiresAt: new Date("2026-05-01T10:00:00.000Z"),
  id: "user-1",
  lines: [
    {
      addedAt: new Date("2026-04-27T10:00:00.000Z"),
      quantity: 2,
      sku: "SKU-1",
      updatedAt: new Date("2026-04-27T10:00:00.000Z")
    }
  ],
  schemaVersion: 1,
  updatedAt: new Date("2026-04-27T10:00:00.000Z"),
  version: 3
});
