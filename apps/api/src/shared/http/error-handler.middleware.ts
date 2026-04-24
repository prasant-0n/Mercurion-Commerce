import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { AppError } from "@/shared/errors/app-error";

const buildErrorResponse = (request: Request, error: AppError) => ({
  error: {
    code: error.code,
    details: error.details,
    message: error.message,
    requestId: request.requestId
  }
});

const mapZodError = (error: ZodError) =>
  new AppError({
    code: "VALIDATION_ERROR",
    details: {
      issues: error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path.join(".")
      }))
    },
    message: "Request validation failed",
    statusCode: 400
  });

const normalizeError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return mapZodError(error);
  }

  return new AppError({
    code: "INTERNAL_SERVER_ERROR",
    isOperational: false,
    message: "Internal server error",
    statusCode: 500
  });
};

export const errorHandlerMiddleware = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction
) => {
  void next;

  const normalizedError = normalizeError(error);

  request.log.error(
    {
      err: error,
      normalizedError: {
        code: normalizedError.code,
        details: normalizedError.details,
        statusCode: normalizedError.statusCode
      },
      requestId: request.requestId
    },
    "Request failed"
  );

  response
    .status(normalizedError.statusCode)
    .json(buildErrorResponse(request, normalizedError));
};
