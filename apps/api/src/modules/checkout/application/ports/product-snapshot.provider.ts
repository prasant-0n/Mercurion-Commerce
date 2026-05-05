export type ProductSnapshot = {
  image: {
    alt: string;
    url: string;
  } | null;
  isActive: boolean;
  name: string;
  price: {
    amount: number;
    currency: string;
  };
  productId: string;
  slug: string;
  sku: string;
};

export interface ProductSnapshotProvider {
  findBySku(sku: string): Promise<ProductSnapshot | null>;
}
