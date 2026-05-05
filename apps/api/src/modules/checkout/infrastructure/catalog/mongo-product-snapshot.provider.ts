import type { Collection } from "mongodb";

import type {
  ProductSnapshot,
  ProductSnapshotProvider
} from "@/modules/checkout/application/ports/product-snapshot.provider";
import { ServiceUnavailableError } from "@/shared/errors/app-error";
import { getMongoDatabase } from "@/shared/infrastructure/mongo/mongo-client";

type CatalogProductDocument = {
  _id: string;
  media: Array<{
    alt: string;
    type: "image";
    url: string;
  }>;
  slug: string;
  status: string;
  title: string;
  variants: Array<{
    isActive: boolean;
    price: {
      amount: number;
      currency: string;
    };
    sku: string;
    title: string;
  }>;
};

const catalogCollectionName = "catalog_products";

export class MongoProductSnapshotProvider implements ProductSnapshotProvider {
  private collectionPromise: Promise<
    Collection<CatalogProductDocument>
  > | null = null;

  async findBySku(sku: string): Promise<ProductSnapshot | null> {
    const collection = await this.getCollection();
    const product = await collection.findOne({
      status: "PUBLISHED",
      "variants.sku": sku
    });

    if (!product) {
      return null;
    }

    const variant = product.variants.find((item) => item.sku === sku);

    if (!variant) {
      return null;
    }

    const image = product.media[0] ?? null;

    return {
      image: image
        ? {
            alt: image.alt,
            url: image.url
          }
        : null,
      isActive: variant.isActive,
      name: `${product.title} - ${variant.title}`,
      price: {
        amount: variant.price.amount,
        currency: variant.price.currency
      },
      productId: product._id,
      sku: variant.sku,
      slug: product.slug
    };
  }

  private async getCollection() {
    if (this.collectionPromise === null) {
      this.collectionPromise = getMongoDatabase()
        .then((database) =>
          database.collection<CatalogProductDocument>(catalogCollectionName)
        )
        .catch((error: unknown) => {
          this.collectionPromise = null;
          throw new ServiceUnavailableError(
            "MongoDB catalog read model is unavailable",
            {
              cause:
                error instanceof Error
                  ? error.message
                  : "Unknown MongoDB connection error"
            }
          );
        });
    }

    return this.collectionPromise;
  }
}
