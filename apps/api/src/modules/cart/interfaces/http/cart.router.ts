import { Router } from "express";

import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import {
  CartService,
  mapCartResponse
} from "@/modules/cart/application/services/cart.service";
import { RedisCartRepository } from "@/modules/cart/infrastructure/repositories/redis-cart.repository";
import {
  cartLineSchema,
  cartSkuParamsSchema
} from "@/modules/cart/interfaces/http/cart.schemas";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { asyncHandler } from "@/shared/http/async-handler";
import { cartRateLimitMiddleware } from "@/shared/http/security.middleware";

const createDefaultCartService = () =>
  new CartService(new RedisCartRepository());

export const createCartRouter = (
  cartService: CartService = createDefaultCartService()
) => {
  const router = Router();

  router.use(cartRateLimitMiddleware);
  router.use(asyncHandler(authenticateRequest));
  router.use(requireAuthentication);

  router.get(
    "/",
    asyncHandler(async (request, response) => {
      const cart = await cartService.getCart(
        readCustomerId(request.auth?.userId)
      );
      response.status(200).json(mapCartResponse(cart));
    })
  );

  router.put(
    "/items/:sku",
    asyncHandler(async (request, response) => {
      const params = cartSkuParamsSchema.parse(request.params);
      const input = cartLineSchema.parse(request.body);
      const cart = await cartService.upsertLine({
        customerId: readCustomerId(request.auth?.userId),
        quantity: input.quantity,
        sku: params.sku
      });

      response.status(200).json(mapCartResponse(cart));
    })
  );

  router.delete(
    "/items/:sku",
    asyncHandler(async (request, response) => {
      const params = cartSkuParamsSchema.parse(request.params);
      const cart = await cartService.removeLine(
        readCustomerId(request.auth?.userId),
        params.sku
      );

      response.status(200).json(mapCartResponse(cart));
    })
  );

  router.delete(
    "/",
    asyncHandler(async (request, response) => {
      const cart = await cartService.clearCart(
        readCustomerId(request.auth?.userId)
      );
      response.status(200).json(mapCartResponse(cart));
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
