import { env } from "@/config/env";
import type {
  Cart,
  CartLine,
  CartRepository
} from "@/modules/cart/application/ports/cart.repository";
import { BadRequestError } from "@/shared/errors/app-error";

type UpsertCartLineInput = {
  customerId: string;
  quantity: number;
  sku: string;
};

export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getCart(customerId: string): Promise<Cart> {
    const cart = await this.cartRepository.getByCustomerId(customerId);

    if (cart) {
      return cart;
    }

    return buildEmptyCart(customerId, this.now());
  }

  async upsertLine(input: UpsertCartLineInput): Promise<Cart> {
    const sku = normalizeSku(input.sku);
    validateSku(sku);
    validateQuantity(input.quantity);

    const now = this.now();
    const existingCart = await this.cartRepository.getByCustomerId(
      input.customerId
    );
    const cart = existingCart ?? buildEmptyCart(input.customerId, now);
    const existingLine = cart.lines.find((line) => line.sku === sku);

    if (!existingLine && cart.lines.length >= env.CART_MAX_LINES) {
      throw new BadRequestError("Cart line limit reached", {
        maxLines: env.CART_MAX_LINES
      });
    }

    const nextLines = existingLine
      ? cart.lines.map((line) =>
          line.sku === sku
            ? {
                ...line,
                quantity: input.quantity,
                updatedAt: now
              }
            : line
        )
      : [
          ...cart.lines,
          {
            addedAt: now,
            quantity: input.quantity,
            sku,
            updatedAt: now
          }
        ];

    return this.cartRepository.save({
      ...cart,
      lines: nextLines,
      updatedAt: now,
      version: cart.version + 1
    });
  }

  async removeLine(customerId: string, skuInput: string): Promise<Cart> {
    const sku = normalizeSku(skuInput);
    validateSku(sku);

    const existingCart = await this.cartRepository.getByCustomerId(customerId);

    if (!existingCart) {
      return buildEmptyCart(customerId, this.now());
    }

    if (!existingCart.lines.some((line) => line.sku === sku)) {
      return existingCart;
    }

    const now = this.now();

    return this.cartRepository.save({
      ...existingCart,
      lines: existingCart.lines.filter((line) => line.sku !== sku),
      updatedAt: now,
      version: existingCart.version + 1
    });
  }

  async clearCart(customerId: string): Promise<Cart> {
    const existingCart = await this.cartRepository.getByCustomerId(customerId);
    const now = this.now();

    if (!existingCart) {
      return buildEmptyCart(customerId, now);
    }

    if (existingCart.lines.length === 0) {
      return existingCart;
    }

    return this.cartRepository.save({
      ...existingCart,
      lines: [],
      updatedAt: now,
      version: existingCart.version + 1
    });
  }
}

const buildEmptyCart = (customerId: string, now: Date): Cart => ({
  customerId,
  expiresAt: buildExpiresAt(now),
  id: customerId,
  lines: [],
  schemaVersion: env.CART_SCHEMA_VERSION,
  updatedAt: now,
  version: 1
});

const buildExpiresAt = (now: Date) =>
  new Date(now.getTime() + env.CART_TTL_DAYS * 24 * 60 * 60 * 1000);

const normalizeSku = (sku: string) => sku.trim();

const validateQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BadRequestError("Cart line quantity must be a positive integer");
  }

  if (quantity > env.CART_MAX_QUANTITY_PER_LINE) {
    throw new BadRequestError(
      "Cart line quantity exceeds the maximum allowed",
      {
        maxQuantityPerLine: env.CART_MAX_QUANTITY_PER_LINE
      }
    );
  }
};

const validateSku = (sku: string) => {
  if (sku.length === 0 || sku.length > 128) {
    throw new BadRequestError("Cart line sku is invalid");
  }
};

export const mapCartResponse = (cart: Cart) => ({
  cart: {
    customerId: cart.customerId,
    expiresAt: cart.expiresAt.toISOString(),
    id: cart.id,
    lines: cart.lines.map(mapCartLineResponse),
    schemaVersion: cart.schemaVersion,
    updatedAt: cart.updatedAt.toISOString(),
    version: cart.version
  }
});

const mapCartLineResponse = (line: CartLine) => ({
  addedAt: line.addedAt.toISOString(),
  quantity: line.quantity,
  sku: line.sku,
  updatedAt: line.updatedAt.toISOString()
});
