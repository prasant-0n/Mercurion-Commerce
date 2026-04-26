import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const prisma = new PrismaClient({
  log: ["warn", "error"]
});

type AuthSuccessBody = {
  accessToken: string;
  tokenType: string;
  user: {
    email: string;
    id: string;
    permissions: string[];
    roles: string[];
    status: string;
  };
};

type ErrorResponseBody = {
  error?: {
    message?: string;
  };
};

type PasswordResetRequestBody = {
  accepted: boolean;
};

type MeResponseBody = {
  user: {
    email: string;
  };
};

class InMemoryPasswordResetNotifier {
  lastNotification:
    | {
        email: string;
        expiresAt: Date;
        token: string;
        userId: string;
      }
    | undefined;

  sendPasswordReset(notification: {
    email: string;
    expiresAt: Date;
    token: string;
    userId: string;
  }) {
    this.lastNotification = notification;

    return Promise.resolve();
  }
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await clearAuthState();
  await seedCustomerRole();
});

afterEach(() => {
  vi.resetModules();
});

afterAll(async () => {
  await clearAuthState();
  await prisma.$disconnect();
});

describe.sequential("auth flows", () => {
  it("registers a user, hashes the password, and returns an authenticated profile", async () => {
    const app = await loadApp();

    const registerResponse = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "customer@example.com",
        password: "Password123!"
      });

    expect(registerResponse.status).toBe(201);
    expect(readAuthBody(registerResponse).tokenType).toBe("Bearer");
    expect(readAuthBody(registerResponse).user.email).toBe(
      "customer@example.com"
    );
    expect(readAuthBody(registerResponse).user.roles).toContain("CUSTOMER");
    expect(readRefreshCookie(registerResponse)).toContain("refresh_token=");

    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: {
        email: "customer@example.com"
      }
    });

    expect(persistedUser.passwordHash).not.toBe("Password123!");

    const profileResponse = await request(app)
      .get("/api/v1/auth/me")
      .set(
        "authorization",
        `Bearer ${readAuthBody(registerResponse).accessToken}`
      );

    expect(profileResponse.status).toBe(200);
    expect(readMeBody(profileResponse).user.email).toBe("customer@example.com");
  });

  it("authenticates with login and rotates refresh tokens", async () => {
    const app = await loadApp();

    await registerUser(app, {
      email: "rotate@example.com",
      password: "Password123!"
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "rotate@example.com",
      password: "Password123!"
    });

    expect(loginResponse.status).toBe(200);

    const originalRefreshCookie = readRefreshCookie(loginResponse);
    const originalRefreshToken = extractCookieValue(originalRefreshCookie);
    const originalTokenRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: hashToken(originalRefreshToken)
      }
    });

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalRefreshCookie);

    expect(refreshResponse.status).toBe(200);

    const rotatedRefreshCookie = readRefreshCookie(refreshResponse);
    const rotatedRefreshToken = extractCookieValue(rotatedRefreshCookie);
    const rotatedTokenRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: hashToken(rotatedRefreshToken)
      }
    });

    const revokedOriginalToken = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        id: originalTokenRecord.id
      }
    });

    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);
    expect(rotatedTokenRecord.familyId).toBe(originalTokenRecord.familyId);
    expect(revokedOriginalToken.revokedAt).not.toBeNull();
    expect(revokedOriginalToken.replacedByTokenId).toBe(rotatedTokenRecord.id);
  });

  it("revokes the full refresh-token family when a rotated token is reused", async () => {
    const app = await loadApp();

    const registerResponse = await registerUser(app, {
      email: "reuse@example.com",
      password: "Password123!"
    });
    const firstRefreshCookie = readRefreshCookie(registerResponse);
    const firstRefreshToken = extractCookieValue(firstRefreshCookie);

    const rotateResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstRefreshCookie);

    expect(rotateResponse.status).toBe(200);

    const secondRefreshCookie = readRefreshCookie(rotateResponse);
    const firstReuseResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstRefreshCookie);

    expect(firstReuseResponse.status).toBe(401);
    expect(readErrorBody(firstReuseResponse).error?.message).toBe(
      "Refresh token has been revoked"
    );

    const secondRefreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", secondRefreshCookie);

    expect(secondRefreshResponse.status).toBe(401);

    const reusedTokenRecord = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: hashToken(firstRefreshToken)
      }
    });
    const familyTokens = await prisma.refreshToken.findMany({
      where: {
        familyId: reusedTokenRecord.familyId
      }
    });

    expect(familyTokens).toHaveLength(2);
    expect(familyTokens.every((token) => token.revokedAt !== null)).toBe(true);
  });

  it("revokes the submitted refresh token on logout", async () => {
    const app = await loadApp();

    const registerResponse = await registerUser(app, {
      email: "logout@example.com",
      password: "Password123!"
    });
    const refreshCookie = readRefreshCookie(registerResponse);

    const logoutResponse = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie);

    expect(logoutResponse.status).toBe(204);
    expect(logoutResponse.headers["set-cookie"]?.[0]).toContain(
      "refresh_token=;"
    );

    const refreshAfterLogoutResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);

    expect(refreshAfterLogoutResponse.status).toBe(401);
  });

  it("handles password reset request and confirm with session revocation", async () => {
    const notifier = new InMemoryPasswordResetNotifier();
    const app = await loadApp(notifier);

    const registerResponse = await registerUser(app, {
      email: "reset@example.com",
      password: "Password123!"
    });
    const oldRefreshCookie = readRefreshCookie(registerResponse);

    const requestResetResponse = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({
        email: "reset@example.com"
      });

    expect(requestResetResponse.status).toBe(202);
    expect(readPasswordResetRequestBody(requestResetResponse).accepted).toBe(
      true
    );
    expect(notifier.lastNotification?.email).toBe("reset@example.com");
    expect(notifier.lastNotification?.token).toBeTruthy();
    const resetToken = notifier.lastNotification?.token;

    if (!resetToken) {
      throw new Error("Expected password reset token to be captured");
    }

    const confirmResetResponse = await request(app)
      .post("/api/v1/auth/password-reset/confirm")
      .send({
        password: "NewPassword123!",
        token: resetToken
      });

    expect(confirmResetResponse.status).toBe(200);
    expect(readAuthBody(confirmResetResponse).user.email).toBe(
      "reset@example.com"
    );

    const refreshAfterResetResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", oldRefreshCookie);

    expect(refreshAfterResetResponse.status).toBe(401);

    const oldPasswordLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset@example.com",
        password: "Password123!"
      });

    expect(oldPasswordLoginResponse.status).toBe(401);

    const newPasswordLoginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "reset@example.com",
        password: "NewPassword123!"
      });

    expect(newPasswordLoginResponse.status).toBe(200);

    const passwordResetToken = await prisma.passwordResetToken.findFirstOrThrow(
      {
        where: {
          user: {
            email: "reset@example.com"
          }
        }
      }
    );

    expect(passwordResetToken.consumedAt).not.toBeNull();
  });
});

const loadApp = async (notifier?: InMemoryPasswordResetNotifier) => {
  const [
    { createApp },
    { RuntimeState },
    { AuthService },
    { BcryptPasswordHasher },
    { PrismaAuthSessionRepository },
    { JwtTokenService }
  ] = await Promise.all([
    import("../../src/app"),
    import("../../src/shared/runtime/runtime-state"),
    import("../../src/modules/auth/application/services/auth.service"),
    import("../../src/modules/auth/infrastructure/crypto/bcrypt-password-hasher"),
    import("../../src/modules/auth/infrastructure/repositories/prisma-auth-session.repository"),
    import("../../src/modules/auth/infrastructure/tokens/jwt-token.service")
  ]);

  const authService = new AuthService(
    new PrismaAuthSessionRepository(),
    new BcryptPasswordHasher(),
    new JwtTokenService(),
    notifier ?? new InMemoryPasswordResetNotifier()
  );

  return createApp(new RuntimeState(), {
    authService
  });
};

const registerUser = (
  app: Parameters<typeof request>[0],
  input: {
    email: string;
    password: string;
  }
) =>
  request(app).post("/api/v1/auth/register").send({
    email: input.email,
    password: input.password
  });

const clearAuthState = async () => {
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.user.deleteMany()
  ]);
};

const seedCustomerRole = async () => {
  await prisma.role.upsert({
    create: {
      name: "CUSTOMER"
    },
    update: {},
    where: {
      name: "CUSTOMER"
    }
  });
};

const readAuthBody = (response: request.Response) =>
  response.body as AuthSuccessBody;

const readErrorBody = (response: request.Response) =>
  response.body as ErrorResponseBody;

const readMeBody = (response: request.Response) =>
  response.body as MeResponseBody;

const readPasswordResetRequestBody = (response: request.Response) =>
  response.body as PasswordResetRequestBody;

const readRefreshCookie = (response: request.Response) => {
  const cookies = response.headers["set-cookie"] as string[] | undefined;
  const cookie = cookies?.find((value) => value.startsWith("refresh_token="));

  expect(cookie).toBeDefined();
  return cookie as string;
};

const extractCookieValue = (cookie: string) => {
  const token = cookie.split(";")[0]?.split("=")[1];

  if (!token) {
    throw new Error("Refresh token cookie is missing a value");
  }

  return token;
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
