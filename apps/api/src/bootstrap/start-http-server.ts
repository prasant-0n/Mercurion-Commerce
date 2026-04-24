import type { Server } from "node:http";

import type { Express } from "express";

import { env } from "@/config/env";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

export const startHttpServer = (app: Express, runtimeState: RuntimeState) => {
  const server = app.listen(env.PORT, env.HOST, () => {
    runtimeState.markReady();

    console.log(
      `API listening on http://${env.HOST}:${String(env.PORT)} in ${env.NODE_ENV} mode`
    );
  });

  registerShutdownHandlers(server, runtimeState);

  return server;
};

const registerShutdownHandlers = (
  server: Server,
  runtimeState: RuntimeState
) => {
  const gracefulShutdown = (signal: NodeJS.Signals) => {
    runtimeState.markShuttingDown();
    console.log(`Received ${signal}. Starting graceful shutdown.`);

    server.close((error) => {
      if (error) {
        console.error("HTTP server shutdown failed.", error);
        process.exitCode = 1;
      }

      process.exit();
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, env.GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
  };

  shutdownSignals.forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });
};
