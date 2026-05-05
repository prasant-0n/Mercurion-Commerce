import { randomUUID } from "node:crypto";

import type {
  CatalogProduct,
  CatalogProductStatus,
  CatalogProductVariant,
  CatalogProductWriteInput,
  CatalogRepository,
  ListCatalogProductsFilters
} from "@/modules/catalog/application/ports/catalog.repository";
import { BadRequestError, NotFoundError } from "@/shared/errors/app-error";

type UpdateCatalogProductInput = CatalogProductWriteInput & {
  productId: string;
};

export class CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createProduct(
    input: CatalogProductWriteInput
  ): Promise<CatalogProduct> {
    validateCatalogWriteInput(input);

    const now = this.now();

    return this.catalogRepository.create({
      ...normalizeCatalogWriteInput(input),
      createdAt: now,
      id: buildProductId(),
      updatedAt: now
    });
  }

  async getProduct(productId: string): Promise<CatalogProduct> {
    const product = await this.catalogRepository.findById(productId);

    if (!product) {
      throw new NotFoundError("Catalog product not found", {
        productId
      });
    }

    return product;
  }

  async listProducts(
    filters: ListCatalogProductsFilters
  ): Promise<CatalogProduct[]> {
    return this.catalogRepository.list({
      ...filters,
      brandId: filters.brandId?.trim(),
      categoryId: filters.categoryId?.trim(),
      slug: filters.slug?.trim().toLowerCase()
    });
  }

  async updateProduct(
    input: UpdateCatalogProductInput
  ): Promise<CatalogProduct> {
    validateCatalogWriteInput(input);

    const existingProduct = await this.catalogRepository.findById(
      input.productId
    );

    if (!existingProduct) {
      throw new NotFoundError("Catalog product not found", {
        productId: input.productId
      });
    }

    const updatedProduct = await this.catalogRepository.update({
      ...existingProduct,
      ...normalizeCatalogWriteInput(input),
      updatedAt: this.now()
    });

    if (!updatedProduct) {
      throw new NotFoundError("Catalog product not found", {
        productId: input.productId
      });
    }

    return updatedProduct;
  }
}

const buildProductId = () => `prod_${randomUUID()}`;

const validateCatalogWriteInput = (input: CatalogProductWriteInput) => {
  validateAuthoringStatus(input.status);
  validateVariantCurrencies(input.variants);
  validateUniqueVariantSkus(input.variants);
};

const validateAuthoringStatus = (status: CatalogProductStatus) => {
  if (status === "PUBLISHED") {
    throw new BadRequestError(
      "Published status is reserved for the catalog publication flow"
    );
  }
};

const validateVariantCurrencies = (variants: CatalogProductVariant[]) => {
  const currencies = new Set(variants.map((variant) => variant.price.currency));

  if (currencies.size > 1) {
    throw new BadRequestError(
      "All catalog product variants must use the same currency"
    );
  }

  for (const variant of variants) {
    if (
      variant.compareAtPrice &&
      variant.compareAtPrice.currency !== variant.price.currency
    ) {
      throw new BadRequestError(
        "Variant compare-at price currency must match the selling price currency",
        {
          sku: variant.sku
        }
      );
    }

    if (
      variant.compareAtPrice &&
      variant.compareAtPrice.amount < variant.price.amount
    ) {
      throw new BadRequestError(
        "Variant compare-at price must be greater than or equal to the selling price",
        {
          sku: variant.sku
        }
      );
    }
  }
};

const validateUniqueVariantSkus = (variants: CatalogProductVariant[]) => {
  const seenSkus = new Set<string>();

  for (const variant of variants) {
    if (seenSkus.has(variant.sku)) {
      throw new BadRequestError(
        "Catalog product contains duplicate variant SKUs",
        {
          sku: variant.sku
        }
      );
    }

    seenSkus.add(variant.sku);
  }
};

const normalizeCatalogWriteInput = (
  input: CatalogProductWriteInput
): CatalogProductWriteInput => ({
  attributes: normalizeAttributes(input.attributes),
  brand: {
    id: input.brand.id.trim(),
    name: input.brand.name.trim()
  },
  categories: input.categories.map((category) => ({
    id: category.id.trim(),
    name: category.name.trim()
  })),
  description: {
    long: input.description.long.trim(),
    short: input.description.short.trim()
  },
  media: input.media.map((mediaItem) => ({
    alt: mediaItem.alt.trim(),
    type: mediaItem.type,
    url: mediaItem.url.trim()
  })),
  seo: {
    description: input.seo.description.trim(),
    title: input.seo.title.trim()
  },
  slug: input.slug.trim().toLowerCase(),
  status: input.status,
  title: input.title.trim(),
  variants: input.variants.map((variant) => ({
    attributes: normalizeAttributes(variant.attributes),
    barcode: variant.barcode?.trim(),
    compareAtPrice: variant.compareAtPrice
      ? {
          amount: variant.compareAtPrice.amount,
          currency: variant.compareAtPrice.currency.trim().toUpperCase()
        }
      : undefined,
    isActive: variant.isActive,
    price: {
      amount: variant.price.amount,
      currency: variant.price.currency.trim().toUpperCase()
    },
    sku: variant.sku.trim(),
    title: variant.title.trim(),
    weightGrams: variant.weightGrams
  }))
});

const normalizeAttributes = (attributes: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [key.trim(), value.trim()])
  );

export const mapCatalogProductResponse = (product: CatalogProduct) => ({
  product: {
    attributes: product.attributes,
    brand: product.brand,
    categories: product.categories,
    createdAt: product.createdAt.toISOString(),
    description: product.description,
    id: product.id,
    media: product.media,
    publication: product.publication
      ? {
          publishedAt: product.publication.publishedAt.toISOString(),
          version: product.publication.version
        }
      : null,
    seo: product.seo,
    slug: product.slug,
    status: product.status,
    title: product.title,
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((variant) => ({
      attributes: variant.attributes,
      barcode: variant.barcode ?? null,
      compareAtPrice: variant.compareAtPrice ?? null,
      isActive: variant.isActive,
      price: variant.price,
      sku: variant.sku,
      title: variant.title,
      weightGrams: variant.weightGrams ?? null
    }))
  }
});

export const mapCatalogProductsResponse = (products: CatalogProduct[]) => ({
  count: products.length,
  products: products.map(
    (product) => mapCatalogProductResponse(product).product
  )
});
