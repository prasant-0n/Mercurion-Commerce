import { z } from "zod";

const skuSchema = z.string().trim().min(1).max(128);
const uuidSchema = z.string().uuid();

export const inventoryItemBodySchema = z.object({
  onHandQty: z.number().int().min(0),
  sku: skuSchema,
  warehouseId: uuidSchema
});

export const inventoryItemParamsSchema = z.object({
  sku: skuSchema,
  warehouseId: uuidSchema
});

export const inventoryAdjustmentBodySchema = z.object({
  quantityDelta: z
    .number()
    .int()
    .refine((value) => value !== 0, {
      message: "quantityDelta must be non-zero"
    })
});

export const inventoryItemListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  sku: skuSchema.optional(),
  warehouseId: uuidSchema.optional()
});

export const inventoryReservationBodySchema = z.object({
  expiresAt: z.coerce.date().optional(),
  lines: z
    .array(
      z.object({
        quantity: z.number().int().positive(),
        sku: skuSchema
      })
    )
    .min(1)
    .max(100),
  orderId: uuidSchema
});
