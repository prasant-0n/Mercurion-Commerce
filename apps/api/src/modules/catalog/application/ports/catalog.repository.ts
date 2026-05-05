export const catalogProductStatuses = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED"
] as const;

export type CatalogProductStatus = (typeof catalogProductStatuses)[number];

export type CatalogProductBrand = {
  id: string;
  name: string;
};

export type CatalogProductCategory = {
  id: string;
  name: string;
};

export type CatalogProductDescription = {
  long: string;
  short: string;
};

export type CatalogProductMedia = {
  alt: string;
  type: "image";
  url: string;
};

export type CatalogMoney = {
  amount: number;
  currency: string;
};

export type CatalogProductVariant = {
  attributes: Record<string, string>;
  barcode?: string | undefined;
  compareAtPrice?: CatalogMoney | undefined;
  isActive: boolean;
  price: CatalogMoney;
  sku: string;
  title: string;
  weightGrams?: number | undefined;
};

export type CatalogProductSeo = {
  description: string;
  title: string;
};

export type CatalogProductPublication = {
  publishedAt: Date;
  version: number;
};

export type CatalogProduct = {
  attributes: Record<string, string>;
  brand: CatalogProductBrand;
  categories: CatalogProductCategory[];
  createdAt: Date;
  description: CatalogProductDescription;
  id: string;
  media: CatalogProductMedia[];
  publication?: CatalogProductPublication | undefined;
  seo: CatalogProductSeo;
  slug: string;
  status: CatalogProductStatus;
  title: string;
  updatedAt: Date;
  variants: CatalogProductVariant[];
};

export type CatalogProductWriteInput = {
  attributes: Record<string, string>;
  brand: CatalogProductBrand;
  categories: CatalogProductCategory[];
  description: CatalogProductDescription;
  media: CatalogProductMedia[];
  seo: CatalogProductSeo;
  slug: string;
  status: CatalogProductStatus;
  title: string;
  variants: CatalogProductVariant[];
};

export type ListCatalogProductsFilters = {
  brandId?: string | undefined;
  categoryId?: string | undefined;
  limit: number;
  slug?: string | undefined;
  status?: CatalogProductStatus | undefined;
};

export interface CatalogRepository {
  create(product: CatalogProduct): Promise<CatalogProduct>;
  findById(productId: string): Promise<CatalogProduct | null>;
  list(filters: ListCatalogProductsFilters): Promise<CatalogProduct[]>;
  update(product: CatalogProduct): Promise<CatalogProduct | null>;
}
