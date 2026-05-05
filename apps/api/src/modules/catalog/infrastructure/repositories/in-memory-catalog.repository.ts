import type {
  CatalogProduct,
  CatalogRepository,
  ListCatalogProductsFilters
} from "@/modules/catalog/application/ports/catalog.repository";
import { ConflictError } from "@/shared/errors/app-error";

export class InMemoryCatalogRepository implements CatalogRepository {
  readonly #products = new Map<string, CatalogProduct>();

  create(product: CatalogProduct): Promise<CatalogProduct> {
    this.assertUniqueConstraints(product);
    this.#products.set(product.id, cloneProduct(product));

    return Promise.resolve(cloneProduct(product));
  }

  findById(productId: string): Promise<CatalogProduct | null> {
    const product = this.#products.get(productId);

    return Promise.resolve(product ? cloneProduct(product) : null);
  }

  list(filters: ListCatalogProductsFilters): Promise<CatalogProduct[]> {
    return Promise.resolve(
      Array.from(this.#products.values())
        .filter((product) => matchesFilters(product, filters))
        .sort(
          (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
        )
        .slice(0, filters.limit)
        .map(cloneProduct)
    );
  }

  update(product: CatalogProduct): Promise<CatalogProduct | null> {
    if (!this.#products.has(product.id)) {
      return Promise.resolve(null);
    }

    this.assertUniqueConstraints(product);
    this.#products.set(product.id, cloneProduct(product));

    return Promise.resolve(cloneProduct(product));
  }

  private assertUniqueConstraints(candidate: CatalogProduct) {
    for (const product of this.#products.values()) {
      if (product.id === candidate.id) {
        continue;
      }

      if (product.slug === candidate.slug) {
        throw new ConflictError("Catalog product slug already exists", {
          slug: candidate.slug
        });
      }

      const existingSkus = new Set(
        product.variants.map((variant) => variant.sku)
      );

      for (const variant of candidate.variants) {
        if (existingSkus.has(variant.sku)) {
          throw new ConflictError(
            "Catalog product variant sku already exists",
            {
              sku: variant.sku
            }
          );
        }
      }
    }
  }
}

const matchesFilters = (
  product: CatalogProduct,
  filters: ListCatalogProductsFilters
) => {
  if (filters.status && product.status !== filters.status) {
    return false;
  }

  if (filters.slug && product.slug !== filters.slug) {
    return false;
  }

  if (filters.brandId && product.brand.id !== filters.brandId) {
    return false;
  }

  if (
    filters.categoryId &&
    !product.categories.some((category) => category.id === filters.categoryId)
  ) {
    return false;
  }

  return true;
};

const cloneProduct = (product: CatalogProduct): CatalogProduct => ({
  ...structuredClone(product),
  createdAt: new Date(product.createdAt),
  publication: product.publication
    ? {
        publishedAt: new Date(product.publication.publishedAt),
        version: product.publication.version
      }
    : undefined,
  updatedAt: new Date(product.updatedAt)
});
