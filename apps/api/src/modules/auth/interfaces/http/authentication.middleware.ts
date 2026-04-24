import type { NextFunction, Request, Response } from "express";

import { JwtTokenService } from "@/modules/auth/infrastructure/tokens/jwt-token.service";
import { UnauthorizedError } from "@/shared/errors/app-error";

const tokenService = new JwtTokenService();

export const authenticateRequest = async (
  request: Request,
  _response: Response,
  next: NextFunction
) => {
  const authorizationHeader = request.get("authorization");

  if (!authorizationHeader) {
    return next();
  }

  const accessToken = extractBearerToken(authorizationHeader);
  const auth = await tokenService.verifyAccessToken(accessToken);

  request.auth = auth;
  return next();
};

export const requireAuthentication = (
  request: Request,
  _response: Response,
  next: NextFunction
) => {
  if (!request.auth) {
    return next(new UnauthorizedError("Authentication is required"));
  }

  return next();
};

const extractBearerToken = (authorizationHeader: string) => {
  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new UnauthorizedError("Authorization header is invalid");
  }

  return token;
};
