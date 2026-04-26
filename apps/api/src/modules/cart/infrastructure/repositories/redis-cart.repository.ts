import { env } from "@/config/env";
import type {
  Cart,
  CartRepository
} from "@/modules/cart/application/ports/cart.repository";
import { AppError, ServiceUnavailableError } from "@/shared/errors/app-error";
import { ensureRedisClient } from "@/shared/infrastructure/redis/redis-client";

type PersistedCart = {
  customerId: string;
  expiresAt: string;
  id: string;
  lines: Array<{
    addedAt: string;
    quantity: number;
    sku: string;
    updatedAt: string;
  }>;
  schemaVersion: number;
  updatedAt: string;
  version: number;
};

export interface CartKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  touch(key: string, ttlSeconds: number): Promise<void>;
}

export class RedisCartRepository implements CartRepository {
  constructor(
    private readonly store: CartKeyValueStore = new RedisCartKeyValueStore(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async getByCustomerId(customerId: string): Promise<Cart | null> {
    try {
      const key = buildCartKey(customerId);
      const payload = await this.store.get(key);

      if (!payload) {
        return null;
      }

      await this.store.touch(key, buildCartTtlSeconds());

      return deserializeCart(payload, this.now());
    } catch (error) {
      throw wrapCartStorageError(error);
    }
  }

  async save(cart: Cart): Promise<Cart> {
    try {
      const persistedCart = {
        ...cart,
        expiresAt: buildExpiresAt(this.now())
      };

      await this.store.set(
        buildCartKey(cart.customerId),
        JSON.stringify(serializeCart(persistedCart)),
        buildCartTtlSeconds()
      );

      return persistedCart;
    } catch (error) {
      throw wrapCartStorageError(error);
    }
  }
}

class RedisCartKeyValueStore implements CartKeyValueStore {
  async get(key: string): Promise<string | null> {
    const client = await ensureRedisClient();
    return client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const client = await ensureRedisClient();
    await client.set(key, value, {
      EX: ttlSeconds
    });
  }

  async touch(key: string, ttlSeconds: number): Promise<void> {
    const client = await ensureRedisClient();
    await client.expire(key, ttlSeconds);
  }
}

const buildCartKey = (customerId: string) => `cart:${customerId}`;

const buildCartTtlSeconds = () => env.CART_TTL_DAYS * 24 * 60 * 60;

const buildExpiresAt = (now: Date) =>
  new Date(now.getTime() + buildCartTtlSeconds() * 1000);

const serializeCart = (cart: Cart): PersistedCart => ({
  ...cart,
  expiresAt: cart.expiresAt.toISOString(),
  lines: cart.lines.map((line) => ({
    ...line,
    addedAt: line.addedAt.toISOString(),
    updatedAt: line.updatedAt.toISOString()
  })),
  updatedAt: cart.updatedAt.toISOString()
});

const deserializeCart = (payload: string, now: Date): Cart => {
  let parsedPayload: PersistedCart;

  try {
    parsedPayload = JSON.parse(payload) as PersistedCart;
  } catch {
    throw new AppError({
      code: "CART_PAYLOAD_INVALID",
      message: "Cart payload is invalid",
      statusCode: 500
    });
  }

  return {
    customerId: parsedPayload.customerId,
    expiresAt: buildExpiresAt(now),
    id: parsedPayload.id,
    lines: parsedPayload.lines.map((line) => ({
      ...line,
      addedAt: new Date(line.addedAt),
      updatedAt: new Date(line.updatedAt)
    })),
    schemaVersion: parsedPayload.schemaVersion,
    updatedAt: new Date(parsedPayload.updatedAt),
    version: parsedPayload.version
  };
};

const wrapCartStorageError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  return new ServiceUnavailableError("Cart storage is temporarily unavailable");
};
