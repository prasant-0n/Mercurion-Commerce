import type { IncomingMessage } from "node:http";

import { context, trace } from "@opentelemetry/api";
import pinoHttp from "pino-http";

import { logger } from "@/shared/observability/logger";

type IncomingMessageWithRequestId = IncomingMessage & {
  requestId?: string;
};

export const requestLoggerMiddleware = pinoHttp({
  customProps: (request) => {
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    return {
      requestId:
        (request as IncomingMessageWithRequestId).requestId ?? "unknown",
      spanId: spanContext?.spanId,
      traceId: spanContext?.traceId
    };
  },
  customSuccessMessage: (request, response) =>
    `${request.method} ${request.url} completed with ${response.statusCode}`,
  logger,
  quietReqLogger: true,
  quietResLogger: true
});
