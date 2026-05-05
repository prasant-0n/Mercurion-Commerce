import { z } from "zod";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const skuPattern = /^[A-Za-z0-9][A-Za-z0-9-_:.]*$/;

const nonEmptyTrimmedString = z.string().trim().min(1);
const currencyCodeSchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

const catalogMoneySchema = z.object({
  amount: z.number().int().positive(),
  currency: currencyCodeSchema
});

const catalogAttributeRecordSchema = z.record(
  nonEmptyTrimmedString.max(64),
  nonEmptyTrimmedString.max(256)
);

const catalogCategorySchema = z.object({
  id: nonEmptyTrimmedString.max(64),
  name: nonEmptyTrimmedString.max(128)
});

const catalogBrandSchema = z.object({
  id: nonEmptyTrimmedString.max(64),
  name: nonEmptyTrimmedString.max(128)
});

const catalogMediaSchema = z.object({
  alt: nonEmptyTrimmedString.max(280),
  type: z.literal("image"),
  url: z.string().trim().url()
});

const catalogVariantSchema = z.object({
  attributes: catalogAttributeRecordSchema,
  barcode: z.string().trim().min(1).max(128).optional(),
  compareAtPrice: catalogMoneySchema.optional(),
  isActive: z.boolean(),
  price: catalogMoneySchema,
  sku: z.string().trim().min(1).max(128).regex(skuPattern),
  title: nonEmptyTrimmedString.max(160),
  weightGrams: z.number().int().min(0).optional()
});

const catalogSeoSchema = z.object({
  description: nonEmptyTrimmedString.max(320),
  title: nonEmptyTrimmedString.max(160)
});

export const catalogProductBodySchema = z.object({
  attributes: catalogAttributeRecordSchema,
  brand: catalogBrandSchema,
  categories: z.array(catalogCategorySchema).min(1).max(20),
  description: z.object({
    long: nonEmptyTrimmedString.max(20_000),
    short: nonEmptyTrimmedString.max(280)
  }),
  media: z.array(catalogMediaSchema).max(50).default([]),
  seo: catalogSeoSchema,
  slug: z.string().trim().min(1).max(160).regex(slugPattern),
  status: z.enum(["DRAFT", "ARCHIVED"]).default("DRAFT"),
  title: nonEmptyTrimmedString.max(160),
  variants: z.array(catalogVariantSchema).min(1).max(250)
});

export const catalogProductIdParamsSchema = z.object({
  productId: z.string().trim().min(1).max(128)
});

export const catalogProductListQuerySchema = z.object({
  brandId: z.string().trim().min(1).max(64).optional(),
  categoryId: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  slug: z.string().trim().min(1).max(160).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
});
