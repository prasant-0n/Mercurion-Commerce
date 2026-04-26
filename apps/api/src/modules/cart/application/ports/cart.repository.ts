export type CartLine = {
  addedAt: Date;
  quantity: number;
  sku: string;
  updatedAt: Date;
};

export type Cart = {
  customerId: string;
  expiresAt: Date;
  id: string;
  lines: CartLine[];
  schemaVersion: number;
  updatedAt: Date;
  version: number;
};

export interface CartRepository {
  getByCustomerId(customerId: string): Promise<Cart | null>;
  save(cart: Cart): Promise<Cart>;
}
