import { randomUUID } from "node:crypto";

import { trace } from "@opentelemetry/api";
import type { NextFunction, Request, Response } from "express";

import { requestContext } from "@/shared/http/request-context";

export const requestContextMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction
) => {
  const incomingRequestId = request.header("x-request-id");
  const requestId =
    incomingRequestId && incomingRequestId.length > 0
      ? incomingRequestId
      : randomUUID();

  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  trace.getActiveSpan()?.setAttribute("app.request_id", requestId);

  requestContext.run({ requestId }, next);
};
