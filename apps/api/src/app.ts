import express from "express";

import { healthRouter } from "@/routes/health.route";

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1/health", healthRouter);

  return app;
};
