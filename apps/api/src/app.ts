import express from "express";

import { env } from "@/config/env";
import { createSystemRouter } from "@/routes/system.route";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

export const createApp = (runtimeState: RuntimeState) => {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use(env.API_PREFIX, createSystemRouter(runtimeState));

  return app;
};
