import { Router } from "express";

import { env } from "@/config/env";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    environment: env.NODE_ENV,
    service: "api",
    status: "ok"
  });
});
