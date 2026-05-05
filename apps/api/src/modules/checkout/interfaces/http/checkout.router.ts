import { Router } from "express";

import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import { requirePermissions } from "@/modules/auth/interfaces/http/authorization.middleware";
import {
  CheckoutService,
  mapCheckoutResponse
} from "@/modules/checkout/application/services/checkout.service";
import {
  checkoutBodySchema,
  checkoutIdempotencyKeySchema
} from "@/modules/checkout/interfaces/http/checkout.schemas";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { asyncHandler } from "@/shared/http/async-handler";
import { createIdempotencyMiddleware } from "@/shared/http/idempotency.middleware";
import { checkoutRateLimitMiddleware } from "@/shared/http/security.middleware";

const createDefaultCheckoutService = () => new CheckoutService();

export const createCheckoutRouter = (
  checkoutService: CheckoutService = createDefaultCheckoutService()
) => {
  const router = Router();

  router.use(checkoutRateLimitMiddleware);
  router.use(asyncHandler(authenticateRequest));
  router.use(requireAuthentication);
  router.use(requirePermissions("checkout:create"));

  router.post(
    "/",
    createIdempotencyMiddleware({
      scope: (request) =>
        `checkout:${request.auth?.userId ?? "anonymous"}:${request.path}`
    }),
    asyncHandler(async (request, response) => {
      const body = checkoutBodySchema.parse(request.body);
      const idempotencyKey = checkoutIdempotencyKeySchema.parse(
        request.get("idempotency-key")
      );
      const result = await checkoutService.createCheckout({
        billingAddressId: body.billingAddressId,
        cartId: body.cartId,
        customerId: readCustomerId(request.auth?.userId),
        idempotencyKey,
        paymentMethod: body.paymentMethod,
        shippingAddressId: body.shippingAddressId
      });

      response.status(202).json(mapCheckoutResponse(result));
    })
  );

  return router;
};

const readCustomerId = (userId: string | undefined) => {
  if (!userId) {
    throw new UnauthorizedError("Authentication is required");
  }

  return userId;
};
