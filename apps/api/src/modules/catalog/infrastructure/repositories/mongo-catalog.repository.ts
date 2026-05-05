import type {
  Collection,
  Filter,
  OptionalUnlessRequiredId,
  Sort
} from "mongodb";
import { MongoServerError } from "mongodb";

import {
  type CatalogProduct,
  type CatalogProductStatus,
  catalogProductStatuses,
  type CatalogRepository,
  type ListCatalogProductsFilters
} from "@/modules/catalog/application/ports/catalog.repository";
import {
  ConflictError,
  ServiceUnavailableError
} from "@/shared/errors/app-error";
import { getMongoDatabase } from "@/shared/infrastructure/mongo/mongo-client";

const catalogCollectionName = "catalog_products";

type CatalogProductDocument = {
  _id: string;
  attributes: Record<string, string>;
  brand: {
    id: string;
    name: string;
  };
  categories: Array<{
    id: string;
    name: string;
  }>;
  createdAt: Date;
  description: {
    long: string;
    short: string;
  };
  media: Array<{
    alt: string;
    type: "image";
    url: string;
  }>;
  publication?:
    | {
        publishedAt: Date;
        version: number;
      }
    | undefined;
  seo: {
    description: string;
    title: string;
  };
  slug: string;
  status: CatalogProductStatus;
  title: string;
  updatedAt: Date;
  variants: Array<{
    attributes: Record<string, string>;
    barcode?: string | undefined;
    compareAtPrice?:
      | {
          amount: number;
          currency: string;
        }
      | undefined;
    isActive: boolean;
    price: {
      amount: number;
      currency: string;
    };
    sku: string;
    title: string;
    weightGrams?: number | undefined;
  }>;
};

let catalogCollectionPromise: Promise<
  Collection<CatalogProductDocument>
> | null = null;

export class MongoCatalogRepository implements CatalogRepository {
  async create(product: CatalogProduct): Promise<CatalogProduct> {
    const collection = await this.getCollection();

    try {
      await collection.insertOne(mapProductToDocument(product));
    } catch (error) {
      throw normalizeMongoWriteError(error);
    }

    return product;
  }

  async findById(productId: string): Promise<CatalogProduct | null> {
    const collection = await this.getCollection();
    const document = await collection.findOne({
      _id: productId
    });

    return document ? mapDocumentToProduct(document) : null;
  }

  async list(filters: ListCatalogProductsFilters): Promise<CatalogProduct[]> {
    const collection = await this.getCollection();
    const query = buildListQuery(filters);
    const sort: Sort = {
      updatedAt: -1
    };
    const documents = await collection
      .find(query)
      .sort(sort)
      .limit(filters.limit)
      .toArray();

    return documents.map(mapDocumentToProduct);
  }

  async update(product: CatalogProduct): Promise<CatalogProduct | null> {
    const collection = await this.getCollection();

    try {
      const result = await collection.findOneAndReplace(
        {
          _id: product.id
        },
        mapProductToDocument(product),
        {
          returnDocument: "after"
        }
      );

      return result ? mapDocumentToProduct(result) : null;
    } catch (error) {
      throw normalizeMongoWriteError(error);
    }
  }

  private async getCollection() {
    if (catalogCollectionPromise === null) {
      catalogCollectionPromise = ensureCatalogCollection();
    }

    try {
      return await catalogCollectionPromise;
    } catch (error) {
      catalogCollectionPromise = null;
      throw error;
    }
  }
}

const ensureCatalogCollection = async () => {
  try {
    const database = await getMongoDatabase();
    const existingCollections = await database
      .listCollections({
        name: catalogCollectionName
      })
      .toArray();

    if (existingCollections.length === 0) {
      await database.createCollection(catalogCollectionName, {
        validationAction: "error",
        validator: buildCatalogCollectionValidator()
      });
    } else {
      await database.command({
        collMod: catalogCollectionName,
        validationAction: "error",
        validator: buildCatalogCollectionValidator()
      });
    }

    const collection = database.collection<CatalogProductDocument>(
      catalogCollectionName
    );

    await Promise.all([
      collection.createIndex(
        {
          slug: 1
        },
        {
          name: "uq_catalog_products_slug",
          unique: true
        }
      ),
      collection.createIndex(
        {
          status: 1,
          "publication.version": -1
        },
        {
          name: "idx_catalog_products_status_publication_version"
        }
      ),
      collection.createIndex(
        {
          "brand.id": 1,
          status: 1
        },
        {
          name: "idx_catalog_products_brand_status"
        }
      ),
      collection.createIndex(
        {
          "categories.id": 1,
          status: 1
        },
        {
          name: "idx_catalog_products_category_status"
        }
      ),
      collection.createIndex(
        {
          "variants.sku": 1
        },
        {
          name: "uq_catalog_products_variant_sku",
          partialFilterExpression: {
            "variants.sku": {
              $exists: true
            }
          },
          unique: true
        }
      )
    ]);

    return collection;
  } catch (error) {
    throw new ServiceUnavailableError("MongoDB catalog store is unavailable", {
      cause:
        error instanceof Error
          ? error.message
          : "Unknown MongoDB connection error"
    });
  }
};

const buildListQuery = (
  filters: ListCatalogProductsFilters
): Filter<CatalogProductDocument> => {
  const query: Filter<CatalogProductDocument> = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.slug) {
    query.slug = filters.slug;
  }

  if (filters.brandId) {
    query["brand.id"] = filters.brandId;
  }

  if (filters.categoryId) {
    query["categories.id"] = filters.categoryId;
  }

  return query;
};

const normalizeMongoWriteError = (error: unknown) => {
  if (error instanceof MongoServerError && error.code === 11000) {
    if (error.message.includes("uq_catalog_products_slug")) {
      return new ConflictError("Catalog product slug already exists");
    }

    if (error.message.includes("uq_catalog_products_variant_sku")) {
      return new ConflictError("Catalog product variant sku already exists");
    }

    return new ConflictError("Catalog product already exists");
  }

  if (error instanceof ServiceUnavailableError) {
    return error;
  }

  return new ServiceUnavailableError("MongoDB catalog store is unavailable");
};

const buildCatalogCollectionValidator = () => ({
  $jsonSchema: {
    additionalProperties: false,
    bsonType: "object",
    properties: {
      _id: {
        bsonType: "string"
      },
      attributes: {
        additionalProperties: {
          bsonType: "string"
        },
        bsonType: "object"
      },
      brand: {
        additionalProperties: false,
        bsonType: "object",
        properties: {
          id: {
            bsonType: "string",
            minLength: 1
          },
          name: {
            bsonType: "string",
            minLength: 1
          }
        },
        required: ["id", "name"]
      },
      categories: {
        bsonType: "array",
        items: {
          additionalProperties: false,
          bsonType: "object",
          properties: {
            id: {
              bsonType: "string",
              minLength: 1
            },
            name: {
              bsonType: "string",
              minLength: 1
            }
          },
          required: ["id", "name"]
        },
        minItems: 1
      },
      createdAt: {
        bsonType: "date"
      },
      description: {
        additionalProperties: false,
        bsonType: "object",
        properties: {
          long: {
            bsonType: "string",
            minLength: 1
          },
          short: {
            bsonType: "string",
            minLength: 1
          }
        },
        required: ["short", "long"]
      },
      media: {
        bsonType: "array",
        items: {
          additionalProperties: false,
          bsonType: "object",
          properties: {
            alt: {
              bsonType: "string",
              minLength: 1
            },
            type: {
              enum: ["image"]
            },
            url: {
              bsonType: "string",
              minLength: 1
            }
          },
          required: ["type", "url", "alt"]
        }
      },
      publication: {
        bsonType: ["object", "null"],
        properties: {
          publishedAt: {
            bsonType: "date"
          },
          version: {
            bsonType: "int",
            minimum: 1
          }
        }
      },
      seo: {
        additionalProperties: false,
        bsonType: "object",
        properties: {
          description: {
            bsonType: "string",
            minLength: 1
          },
          title: {
            bsonType: "string",
            minLength: 1
          }
        },
        required: ["title", "description"]
      },
      slug: {
        bsonType: "string",
        minLength: 1
      },
      status: {
        enum: [...catalogProductStatuses]
      },
      title: {
        bsonType: "string",
        minLength: 1
      },
      updatedAt: {
        bsonType: "date"
      },
      variants: {
        bsonType: "array",
        items: {
          additionalProperties: false,
          bsonType: "object",
          properties: {
            attributes: {
              additionalProperties: {
                bsonType: "string"
              },
              bsonType: "object"
            },
            barcode: {
              bsonType: ["string", "null"]
            },
            compareAtPrice: {
              bsonType: ["object", "null"],
              properties: {
                amount: {
                  bsonType: "int",
                  minimum: 1
                },
                currency: {
                  bsonType: "string",
                  minLength: 3,
                  maxLength: 3
                }
              }
            },
            isActive: {
              bsonType: "bool"
            },
            price: {
              additionalProperties: false,
              bsonType: "object",
              properties: {
                amount: {
                  bsonType: "int",
                  minimum: 1
                },
                currency: {
                  bsonType: "string",
                  minLength: 3,
                  maxLength: 3
                }
              },
              required: ["amount", "currency"]
            },
            sku: {
              bsonType: "string",
              minLength: 1
            },
            title: {
              bsonType: "string",
              minLength: 1
            },
            weightGrams: {
              bsonType: ["int", "null"],
              minimum: 0
            }
          },
          required: ["sku", "title", "price", "attributes", "isActive"]
        },
        minItems: 1
      }
    },
    required: [
      "_id",
      "slug",
      "status",
      "brand",
      "title",
      "description",
      "categories",
      "media",
      "attributes",
      "variants",
      "seo",
      "createdAt",
      "updatedAt"
    ]
  }
});

const mapProductToDocument = (
  product: CatalogProduct
): OptionalUnlessRequiredId<CatalogProductDocument> => ({
  _id: product.id,
  attributes: product.attributes,
  brand: product.brand,
  categories: product.categories,
  createdAt: product.createdAt,
  description: product.description,
  media: product.media,
  publication: product.publication,
  seo: product.seo,
  slug: product.slug,
  status: product.status,
  title: product.title,
  updatedAt: product.updatedAt,
  variants: product.variants
});

const mapDocumentToProduct = (
  document: CatalogProductDocument
): CatalogProduct => ({
  attributes: document.attributes,
  brand: document.brand,
  categories: document.categories,
  createdAt: document.createdAt,
  description: document.description,
  id: document._id,
  media: document.media,
  publication: document.publication,
  seo: document.seo,
  slug: document.slug,
  status: document.status,
  title: document.title,
  updatedAt: document.updatedAt,
  variants: document.variants
});
