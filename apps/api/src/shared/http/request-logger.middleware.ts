import type { IncomingMessage } from "node:http";

import pinoHttp from "pino-http";

import { logger } from "@/shared/observability/logger";

type IncomingMessageWithRequestId = IncomingMessage & {
  requestId?: string;
};

export const requestLoggerMiddleware = pinoHttp({
  customProps: (request) => ({
    requestId: (request as IncomingMessageWithRequestId).requestId ?? "unknown"
  }),
  customSuccessMessage: (request, response) =>
    `${request.method} ${request.url} completed with ${response.statusCode}`,
  logger,
  quietReqLogger: true,
  quietResLogger: true
});
