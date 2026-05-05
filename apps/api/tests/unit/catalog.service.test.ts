import { describe, expect, it } from "vitest";

import { CatalogService } from "@/modules/catalog/application/services/catalog.service";
import { InMemoryCatalogRepository } from "@/modules/catalog/infrastructure/repositories/in-memory-catalog.repository";

describe("CatalogService", () => {
  it("creates draft products with normalized slug and uppercase currency", async () => {
    const service = new CatalogService(
      new InMemoryCatalogRepository(),
      () => new Date("2026-05-01T10:00:00.000Z")
    );

    const product = await service.createProduct(buildProductInput());

    expect(product.status).toBe("DRAFT");
    expect(product.slug).toBe("nike-air-zoom-pegasus-41");
    expect(product.variants[0]?.price.currency).toBe("INR");
  });

  it("rejects published status on authoring writes", async () => {
    const service = new CatalogService(new InMemoryCatalogRepository());

    await expect(
      service.createProduct({
        ...buildProductInput(),
        status: "PUBLISHED"
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
  });

  it("rejects duplicate variant skus inside one product", async () => {
    const service = new CatalogService(new InMemoryCatalogRepository());
    const baseInput = buildProductInput();
    const baseVariant = baseInput.variants[0];

    if (!baseVariant) {
      throw new Error("Expected base product input to include a variant");
    }

    await expect(
      service.createProduct({
        ...baseInput,
        variants: [
          {
            ...baseVariant
          },
          {
            ...baseVariant
          }
        ]
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST"
    });
  });
});

const buildProductInput = () => ({
  attributes: {
    gender: "men",
    material: "mesh"
  },
  brand: {
    id: "brand_nike",
    name: "Nike"
  },
  categories: [
    {
      id: "running",
      name: "Running"
    }
  ],
  description: {
    long: "Daily trainer for neutral runners.",
    short: "Neutral running shoe"
  },
  media: [
    {
      alt: "Front view",
      type: "image" as const,
      url: "https://cdn.example.com/p/pegasus/front.jpg"
    }
  ],
  seo: {
    description: "Shop Nike Air Zoom Pegasus 41 with fast shipping.",
    title: "Nike Air Zoom Pegasus 41 Running Shoes"
  },
  slug: "Nike-Air-Zoom-Pegasus-41",
  status: "DRAFT" as const,
  title: "Air Zoom Pegasus 41",
  variants: [
    {
      attributes: {
        color: "black",
        size: "10"
      },
      barcode: "123456789",
      isActive: true,
      price: {
        amount: 1299900,
        currency: "inr"
      },
      sku: "PEG41-BLK-10",
      title: "Black / 10",
      weightGrams: 320
    }
  ]
});
