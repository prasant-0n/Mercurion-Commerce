import cookieParser from "cookie-parser";
import express, { type Request } from "express";

import { env } from "@/config/env";
import type { AuthService } from "@/modules/auth/application/services/auth.service";
import { createAuthRouter } from "@/modules/auth/interfaces/http/auth.router";
import type { CartService } from "@/modules/cart/application/services/cart.service";
import { createCartRouter } from "@/modules/cart/interfaces/http/cart.router";
import type { CatalogService } from "@/modules/catalog/application/services/catalog.service";
import { createCatalogRouter } from "@/modules/catalog/interfaces/http/catalog.router";
import type { CheckoutService } from "@/modules/checkout/application/services/checkout.service";
import { createCheckoutRouter } from "@/modules/checkout/interfaces/http/checkout.router";
import { createOrdersRouter } from "@/modules/checkout/interfaces/http/orders.router";
import { createPaymentsRouter } from "@/modules/checkout/interfaces/http/payments.router";
import type { InventoryService } from "@/modules/inventory/application/services/inventory.service";
import { createInventoryRouter } from "@/modules/inventory/interfaces/http/inventory.router";
import { createSystemRouter } from "@/routes/system.route";
import { errorHandlerMiddleware } from "@/shared/http/error-handler.middleware";
import { notFoundMiddleware } from "@/shared/http/not-found.middleware";
import { requestContextMiddleware } from "@/shared/http/request-context.middleware";
import { requestLoggerMiddleware } from "@/shared/http/request-logger.middleware";
import {
  apiRateLimitMiddleware,
  requireJsonContentTypeMiddleware,
  securityHeadersMiddleware
} from "@/shared/http/security.middleware";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

type CreateAppOptions = {
  authService?: AuthService;
  catalogService?: CatalogService;
  cartService?: CartService;
  checkoutService?: CheckoutService;
  inventoryService?: InventoryService;
};

export const createApp = (
  runtimeState: RuntimeState,
  options: CreateAppOptions = {}
) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(apiRateLimitMiddleware);
  app.use(cookieParser());
  app.use(requireJsonContentTypeMiddleware);
  app.use(
    express.json({
      limit: env.REQUEST_BODY_LIMIT,
      verify: (request, _response, buffer) => {
        (request as Request).rawBody = buffer.toString("utf8");
      }
    })
  );
  app.use(
    express.urlencoded({ extended: false, limit: env.REQUEST_BODY_LIMIT })
  );

  app.use(`${env.API_PREFIX}/auth`, createAuthRouter(options.authService));
  app.use(
    `${env.API_PREFIX}/catalog`,
    createCatalogRouter(options.catalogService)
  );
  app.use(`${env.API_PREFIX}/cart`, createCartRouter(options.cartService));
  app.use(
    `${env.API_PREFIX}/inventory`,
    createInventoryRouter(options.inventoryService)
  );
  app.use(
    `${env.API_PREFIX}/checkout`,
    createCheckoutRouter(options.checkoutService)
  );
  app.use(
    `${env.API_PREFIX}/orders`,
    createOrdersRouter(options.checkoutService)
  );
  app.use(
    `${env.API_PREFIX}/payments`,
    createPaymentsRouter(options.checkoutService)
  );
  app.use(env.API_PREFIX, createSystemRouter(runtimeState));
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
};
