import type { Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";

import { env } from "@/config/env";
import { AppError } from "@/shared/errors/app-error";

const bodyBearingMethods = new Set(["PATCH", "POST", "PUT"]);
const publicSystemPaths = new Set([
  `${env.API_PREFIX}/livez`,
  `${env.API_PREFIX}/readyz`
]);

export const securityHeadersMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
});

export const apiRateLimitMiddleware = rateLimit({
  legacyHeaders: false,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please retry later"
    }
  },
  skip: (request) => publicSystemPaths.has(getRequestPath(request)),
  standardHeaders: "draft-8",
  windowMs: env.RATE_LIMIT_WINDOW_MS
});

export const authRateLimitMiddleware = rateLimit({
  legacyHeaders: false,
  limit: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts, please retry later"
    }
  },
  standardHeaders: "draft-8",
  windowMs: env.RATE_LIMIT_WINDOW_MS
});

export const requireJsonContentTypeMiddleware: RequestHandler = (
  request,
  _response,
  next
) => {
  if (!bodyBearingMethods.has(request.method)) {
    return next();
  }

  if (!hasRequestBody(request)) {
    return next();
  }

  if (!request.is("application/json")) {
    return next(
      new AppError({
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json",
        statusCode: 415
      })
    );
  }

  return next();
};

const hasRequestBody = (request: Request) => {
  const contentLengthHeader = request.get("content-length");
  const transferEncoding = request.get("transfer-encoding");

  if (transferEncoding) {
    return true;
  }

  if (!contentLengthHeader) {
    return false;
  }

  const contentLength = Number.parseInt(contentLengthHeader, 10);

  return Number.isFinite(contentLength) && contentLength > 0;
};

const getRequestPath = (request: Request) =>
  stripQueryString(request.originalUrl ?? request.url ?? "/");

const stripQueryString = (url: string) => url.split("?")[0] ?? url;
