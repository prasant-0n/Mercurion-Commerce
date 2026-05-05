import { Router } from "express";

import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import {
  CheckoutService,
  mapOrderResponse
} from "@/modules/checkout/application/services/checkout.service";
import { orderIdParamsSchema } from "@/modules/checkout/interfaces/http/checkout.schemas";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { asyncHandler } from "@/shared/http/async-handler";

const createDefaultCheckoutService = () => new CheckoutService();

export const createOrdersRouter = (
  checkoutService: CheckoutService = createDefaultCheckoutService()
) => {
  const router = Router();

  router.use(asyncHandler(authenticateRequest));
  router.use(requireAuthentication);

  router.get(
    "/:orderId",
    asyncHandler(async (request, response) => {
      const params = orderIdParamsSchema.parse(request.params);
      const order = await checkoutService.getOrder(params.orderId, {
        canReadAny:
          request.auth?.permissions.includes("orders:read:any") ?? false,
        userId: readUserId(request.auth?.userId)
      });

      response.status(200).json({
        order: mapOrderResponse(order)
      });
    })
  );

  return router;
};

const readUserId = (userId: string | undefined) => {
  if (!userId) {
    throw new UnauthorizedError("Authentication is required");
  }

  return userId;
};
