import { Router } from "express";

import { env } from "@/config/env";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

export const createSystemRouter = (runtimeState: RuntimeState) => {
  const router = Router();

  router.get("/livez", (_request, response) => {
    response.status(200).json({
      service: env.APP_NAME,
      status: "ok"
    });
  });

  router.get("/readyz", (_request, response) => {
    const snapshot = runtimeState.snapshot();

    response.status(snapshot.isReady ? 200 : 503).json({
      environment: env.NODE_ENV,
      service: env.APP_NAME,
      status: snapshot.isReady ? "ready" : "not_ready",
      ...snapshot
    });
  });

  return router;
};
