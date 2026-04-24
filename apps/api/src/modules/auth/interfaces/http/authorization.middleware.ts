import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "@/shared/errors/app-error";

export const requirePermissions =
  (...permissions: string[]) =>
  (request: Request, _response: Response, next: NextFunction) => {
    if (!request.auth) {
      return next(new UnauthorizedError("Authentication is required"));
    }

    const hasAllPermissions = permissions.every((permission) =>
      request.auth?.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return next(
        new ForbiddenError("You do not have permission to perform this action")
      );
    }

    return next();
  };
