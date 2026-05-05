import { z } from "zod";

export const checkoutBodySchema = z.object({
  billingAddressId: z.string().trim().min(1).max(128),
  cartId: z.string().trim().min(1).max(128),
  paymentMethod: z.object({
    type: z.enum(["CARD", "UPI_INTENT"])
  }),
  shippingAddressId: z.string().trim().min(1).max(128)
});

export const checkoutIdempotencyKeySchema = z.string().uuid();

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid()
});
