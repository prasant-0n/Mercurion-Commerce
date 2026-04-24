import express from "express";

import { env } from "@/config/env";
import { createSystemRouter } from "@/routes/system.route";
import { requestContextMiddleware } from "@/shared/http/request-context.middleware";
import { requestLoggerMiddleware } from "@/shared/http/request-logger.middleware";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

export const createApp = (runtimeState: RuntimeState) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContextMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(express.json({ limit: "1mb" }));

  app.use(env.API_PREFIX, createSystemRouter(runtimeState));

  return app;
};
