import { env } from "@/config/env";
import type {
  Cart,
  CartRepository
} from "@/modules/cart/application/ports/cart.repository";

export class InMemoryCartRepository implements CartRepository {
  private readonly carts = new Map<string, Cart>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  getByCustomerId(customerId: string): Promise<Cart | null> {
    const cart = this.carts.get(customerId);

    if (!cart) {
      return Promise.resolve(null);
    }

    const touchedCart = {
      ...cloneCart(cart),
      expiresAt: buildExpiresAt(this.now())
    };

    this.carts.set(customerId, touchedCart);

    return Promise.resolve(cloneCart(touchedCart));
  }

  save(cart: Cart): Promise<Cart> {
    const persistedCart = {
      ...cloneCart(cart),
      expiresAt: buildExpiresAt(this.now())
    };

    this.carts.set(cart.customerId, persistedCart);

    return Promise.resolve(cloneCart(persistedCart));
  }
}

const cloneCart = (cart: Cart): Cart => ({
  ...cart,
  expiresAt: new Date(cart.expiresAt),
  lines: cart.lines.map((line) => ({
    ...line,
    addedAt: new Date(line.addedAt),
    updatedAt: new Date(line.updatedAt)
  })),
  updatedAt: new Date(cart.updatedAt)
});

const buildExpiresAt = (now: Date) =>
  new Date(now.getTime() + env.CART_TTL_DAYS * 24 * 60 * 60 * 1000);
