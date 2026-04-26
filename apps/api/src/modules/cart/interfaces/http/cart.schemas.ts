import { z } from "zod";

export const cartLineSchema = z.object({
  quantity: z.number().int().positive()
});

export const cartSkuParamsSchema = z.object({
  sku: z.string().trim().min(1).max(128)
});
