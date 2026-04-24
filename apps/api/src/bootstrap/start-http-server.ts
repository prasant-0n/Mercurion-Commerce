import type { Server } from "node:http";

import type { Express } from "express";

import { env } from "@/config/env";
import { logger } from "@/shared/observability/logger";
import type { RuntimeState } from "@/shared/runtime/runtime-state";

const shutdownSignals = ["SIGINT", "SIGTERM"] as const;

type ShutdownTask = () => Promise<void>;

export const startHttpServer = (
  app: Express,
  runtimeState: RuntimeState,
  shutdownTasks: ShutdownTask[] = []
) => {
  const server = app.listen(env.PORT, env.HOST, () => {
    runtimeState.markReady();

    logger.info(
      {
        environment: env.NODE_ENV,
        host: env.HOST,
        port: env.PORT
      },
      "HTTP server started"
    );
  });

  registerShutdownHandlers(server, runtimeState, shutdownTasks);

  return server;
};

const registerShutdownHandlers = (
  server: Server,
  runtimeState: RuntimeState,
  shutdownTasks: ShutdownTask[]
) => {
  const gracefulShutdown = (signal: NodeJS.Signals) => {
    runtimeState.markShuttingDown();
    logger.warn({ signal }, "Received shutdown signal");

    server.close(async (error) => {
      if (error) {
        logger.error({ error }, "HTTP server shutdown failed");
        process.exitCode = 1;
      }

      await Promise.allSettled(
        shutdownTasks.map((shutdownTask) => shutdownTask())
      );
      logger.info("HTTP server shutdown complete");
      process.exit();
    });

    setTimeout(() => {
      logger.fatal("Forced shutdown after timeout");
      process.exit(1);
    }, env.GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();
  };

  shutdownSignals.forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });
};
