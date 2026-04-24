import type { NextFunction, Request, Response } from "express";

import { NotFoundError } from "@/shared/errors/app-error";

export const notFoundMiddleware = (
  request: Request,
  _response: Response,
  next: NextFunction
) => {
  next(
    new NotFoundError("Route not found", {
      method: request.method,
      path: request.originalUrl
    })
  );
};
