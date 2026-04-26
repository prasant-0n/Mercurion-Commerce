import { type Request, type Response, Router } from "express";

import { env } from "@/config/env";
import { AuthService } from "@/modules/auth/application/services/auth.service";
import { BcryptPasswordHasher } from "@/modules/auth/infrastructure/crypto/bcrypt-password-hasher";
import { LoggerPasswordResetNotifier } from "@/modules/auth/infrastructure/notifiers/logger-password-reset-notifier";
import { PrismaAuthSessionRepository } from "@/modules/auth/infrastructure/repositories/prisma-auth-session.repository";
import { JwtTokenService } from "@/modules/auth/infrastructure/tokens/jwt-token.service";
import {
  authCredentialsSchema,
  optionalRefreshCookieSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  refreshCookieSchema
} from "@/modules/auth/interfaces/http/auth.schemas";
import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { asyncHandler } from "@/shared/http/async-handler";
import { authRateLimitMiddleware } from "@/shared/http/security.middleware";

const createDefaultAuthService = () =>
  new AuthService(
    new PrismaAuthSessionRepository(),
    new BcryptPasswordHasher(),
    new JwtTokenService(),
    new LoggerPasswordResetNotifier()
  );

export const createAuthRouter = (
  authService: AuthService = createDefaultAuthService()
) => {
  const router = Router();

  router.use(authRateLimitMiddleware);

  router.post(
    "/register",
    asyncHandler(async (request, response) => {
      const credentials = authCredentialsSchema.parse(request.body);
      const authResult = await authService.register({
        email: credentials.email,
        password: credentials.password,
        sessionMetadata: buildSessionMetadata(request)
      });

      writeRefreshTokenCookie(response, authResult.refreshToken);
      response
        .status(201)
        .json(buildAuthResponse(authResult.accessToken, authResult.user));
    })
  );

  router.post(
    "/login",
    asyncHandler(async (request, response) => {
      const credentials = authCredentialsSchema.parse(request.body);
      const authResult = await authService.login({
        email: credentials.email,
        password: credentials.password,
        sessionMetadata: buildSessionMetadata(request)
      });

      writeRefreshTokenCookie(response, authResult.refreshToken);
      response
        .status(200)
        .json(buildAuthResponse(authResult.accessToken, authResult.user));
    })
  );

  router.post(
    "/refresh",
    asyncHandler(async (request, response) => {
      const cookies = refreshCookieSchema.parse(request.cookies);
      const refreshToken = readRequiredRefreshToken(cookies);

      const authResult = await authService.refresh({
        refreshToken,
        sessionMetadata: buildSessionMetadata(request)
      });

      writeRefreshTokenCookie(response, authResult.refreshToken);
      response
        .status(200)
        .json(buildAuthResponse(authResult.accessToken, authResult.user));
    })
  );

  router.post(
    "/password-reset/request",
    asyncHandler(async (request, response) => {
      const payload = passwordResetRequestSchema.parse(request.body);

      await authService.requestPasswordReset({
        email: payload.email
      });

      response.status(202).json({
        accepted: true
      });
    })
  );

  router.post(
    "/password-reset/confirm",
    asyncHandler(async (request, response) => {
      const payload = passwordResetConfirmSchema.parse(request.body);
      const authResult = await authService.resetPassword({
        password: payload.password,
        sessionMetadata: buildSessionMetadata(request),
        token: payload.token
      });

      writeRefreshTokenCookie(response, authResult.refreshToken);
      response
        .status(200)
        .json(buildAuthResponse(authResult.accessToken, authResult.user));
    })
  );

  router.post(
    "/logout",
    asyncHandler(async (request, response) => {
      const cookies = optionalRefreshCookieSchema.parse(request.cookies);
      const refreshToken = cookies[env.AUTH_REFRESH_TOKEN_COOKIE_NAME];

      await authService.logout(refreshToken ? { refreshToken } : {});

      clearRefreshTokenCookie(response);
      response.status(204).send();
    })
  );

  router.get(
    "/me",
    asyncHandler(authenticateRequest),
    requireAuthentication,
    (request, response) => {
      response.status(200).json({
        user: request.auth
      });
    }
  );

  return router;
};

const buildAuthResponse = (
  accessToken: string,
  user: {
    email: string;
    id: string;
    permissions: string[];
    roles: string[];
    status: string;
  }
) => ({
  accessToken,
  tokenType: "Bearer",
  user
});

const buildSessionMetadata = (request: Request) => ({
  ipAddress: request.ip,
  userAgent: request.get("user-agent") ?? undefined
});

const readRequiredRefreshToken = (
  cookies: Partial<Record<string, string>>
): string => {
  const refreshToken = cookies[env.AUTH_REFRESH_TOKEN_COOKIE_NAME];

  if (!refreshToken) {
    throw new UnauthorizedError("Refresh token is missing");
  }

  return refreshToken;
};

const clearRefreshTokenCookie = (response: Response) => {
  response.clearCookie(env.AUTH_REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    path: `${env.API_PREFIX}/auth`,
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
};

const writeRefreshTokenCookie = (response: Response, refreshToken: string) => {
  response.cookie(env.AUTH_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    maxAge: env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: `${env.API_PREFIX}/auth`,
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
};
