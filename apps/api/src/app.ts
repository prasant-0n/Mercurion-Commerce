import cookieParser from "cookie-parser";
import express from "express";

import { env } from "@/config/env";
import { createAuthRouter } from "@/modules/auth/interfaces/http/auth.router";
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

export const createApp = (runtimeState: RuntimeState) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(apiRateLimitMiddleware);
  app.use(cookieParser());
  app.use(requireJsonContentTypeMiddleware);
  app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
  app.use(
    express.urlencoded({ extended: false, limit: env.REQUEST_BODY_LIMIT })
  );

  app.use(`${env.API_PREFIX}/auth`, createAuthRouter());
  app.use(env.API_PREFIX, createSystemRouter(runtimeState));
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
};
