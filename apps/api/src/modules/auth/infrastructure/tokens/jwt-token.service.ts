import { jwtVerify, SignJWT } from "jose";

import { env } from "@/config/env";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenService
} from "@/modules/auth/application/ports/token-service";
import { UnauthorizedError } from "@/shared/errors/app-error";

const accessSecret = new TextEncoder().encode(env.AUTH_JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.AUTH_JWT_REFRESH_SECRET);

export class JwtTokenService implements TokenService {
  async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({
      email: payload.email,
      typ: "access"
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.userId)
      .setIssuedAt()
      .setExpirationTime(`${env.AUTH_ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(accessSecret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, accessSecret, {
        algorithms: ["HS256"]
      });

      if (
        payload.typ !== "access" ||
        typeof payload.sub !== "string" ||
        typeof payload.email !== "string"
      ) {
        throw new UnauthorizedError("Access token is invalid");
      }

      return {
        email: payload.email,
        userId: payload.sub
      };
    } catch {
      throw new UnauthorizedError("Access token is invalid");
    }
  }

  async issueRefreshToken(payload: RefreshTokenPayload): Promise<string> {
    return new SignJWT({
      fid: payload.familyId,
      sid: payload.sessionId,
      typ: "refresh"
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.userId)
      .setIssuedAt()
      .setExpirationTime(`${env.AUTH_REFRESH_TOKEN_TTL_DAYS}d`)
      .sign(refreshSecret);
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, refreshSecret, {
        algorithms: ["HS256"]
      });

      if (
        payload.typ !== "refresh" ||
        typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        typeof payload.fid !== "string"
      ) {
        throw new UnauthorizedError("Refresh token is invalid");
      }

      return {
        familyId: payload.fid,
        sessionId: payload.sid,
        userId: payload.sub
      };
    } catch {
      throw new UnauthorizedError("Refresh token is invalid");
    }
  }
}
