import { createHash, randomBytes, randomUUID } from "node:crypto";

import { UserStatus } from "@prisma/client";

import { env } from "@/config/env";
import type {
  AuthSessionRepository,
  CreateRefreshTokenRecord,
  UserRecord
} from "@/modules/auth/application/ports/auth-session.repository";
import type { PasswordHasher } from "@/modules/auth/application/ports/password-hasher";
import type { PasswordResetNotifier } from "@/modules/auth/application/ports/password-reset-notifier";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenService
} from "@/modules/auth/application/ports/token-service";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError
} from "@/shared/errors/app-error";

type AuthSessionMetadata = {
  ipAddress: string | undefined;
  userAgent: string | undefined;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    email: string;
    id: string;
    permissions: string[];
    roles: string[];
    status: UserStatus;
  };
};

export class AuthService {
  constructor(
    private readonly authSessionRepository: AuthSessionRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    private readonly passwordResetNotifier: PasswordResetNotifier
  ) {}

  async register(input: {
    email: string;
    password: string;
    sessionMetadata: AuthSessionMetadata;
  }): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);
    const existingUser =
      await this.authSessionRepository.findUserByEmail(normalizedEmail);

    if (existingUser) {
      throw new ConflictError("User with this email already exists");
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.authSessionRepository.createUser({
      email: normalizedEmail,
      passwordHash
    });

    return this.issueTokens(user, input.sessionMetadata);
  }

  async login(input: {
    email: string;
    password: string;
    sessionMetadata: AuthSessionMetadata;
  }): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);
    const user =
      await this.authSessionRepository.findUserByEmail(normalizedEmail);

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError("User account is not active");
    }

    const isPasswordValid = await this.passwordHasher.compare(
      input.password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    return this.issueTokens(user, input.sessionMetadata);
  }

  async refresh(input: {
    refreshToken: string;
    sessionMetadata: AuthSessionMetadata;
  }): Promise<AuthResponse> {
    const verifiedToken = await this.tokenService.verifyRefreshToken(
      input.refreshToken
    );
    const storedToken = await this.authSessionRepository.findRefreshTokenById(
      verifiedToken.sessionId
    );

    if (!storedToken) {
      throw new UnauthorizedError("Refresh token is invalid");
    }

    if (storedToken.revokedAt) {
      await this.authSessionRepository.revokeRefreshTokenFamily({
        familyId: storedToken.familyId,
        revokedAt: new Date()
      });

      throw new UnauthorizedError("Refresh token has been revoked");
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Refresh token has expired");
    }

    const tokenMatches =
      storedToken.tokenHash === hashToken(input.refreshToken) &&
      storedToken.userId === verifiedToken.userId &&
      storedToken.familyId === verifiedToken.familyId;

    if (!tokenMatches) {
      await this.authSessionRepository.revokeRefreshTokenFamily({
        familyId: storedToken.familyId,
        revokedAt: new Date()
      });

      throw new UnauthorizedError("Refresh token is invalid");
    }

    const user = await this.authSessionRepository.findUserById(
      storedToken.userId
    );

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError("User account is not active");
    }

    const rotatedToken = await this.buildRefreshTokenRecord(
      user.id,
      storedToken.familyId,
      input.sessionMetadata
    );

    await this.authSessionRepository.rotateRefreshToken({
      currentTokenId: storedToken.id,
      replacementToken: rotatedToken.record,
      revokedAt: new Date()
    });

    const accessToken = await this.tokenService.issueAccessToken(
      buildAccessTokenPayload(user)
    );

    return {
      accessToken,
      refreshToken: rotatedToken.rawToken,
      user: buildAuthUser(user)
    };
  }

  async requestPasswordReset(input: { email: string }): Promise<void> {
    const normalizedEmail = normalizeEmail(input.email);
    const user =
      await this.authSessionRepository.findUserByEmail(normalizedEmail);

    if (!user || user.status !== UserStatus.ACTIVE) {
      return;
    }

    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() +
        env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
    );
    const rawToken = randomBytes(32).toString("hex");

    await this.authSessionRepository.revokeOutstandingPasswordResetTokens({
      revokedAt: createdAt,
      userId: user.id
    });
    await this.authSessionRepository.createPasswordResetToken({
      createdAt,
      expiresAt,
      id: randomUUID(),
      tokenHash: hashToken(rawToken),
      userId: user.id
    });

    await this.passwordResetNotifier.sendPasswordReset({
      email: user.email,
      expiresAt,
      token: rawToken,
      userId: user.id
    });
  }

  async resetPassword(input: {
    password: string;
    sessionMetadata: AuthSessionMetadata;
    token: string;
  }): Promise<AuthResponse> {
    const tokenHash = hashToken(input.token);
    const storedToken =
      await this.authSessionRepository.findPasswordResetTokenByTokenHash(
        tokenHash
      );

    if (
      !storedToken ||
      storedToken.consumedAt ||
      storedToken.revokedAt ||
      storedToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestError("Password reset token is invalid or expired");
    }

    const user = await this.authSessionRepository.findUserById(
      storedToken.userId
    );

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedError("User account is not active");
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();
    const wasReset =
      await this.authSessionRepository.replacePasswordUsingResetToken({
        consumedAt: now,
        newPasswordHash: passwordHash,
        passwordResetTokenId: storedToken.id,
        revokedAt: now,
        userId: user.id
      });

    if (!wasReset) {
      throw new BadRequestError("Password reset token is invalid or expired");
    }

    return this.issueTokens(user, input.sessionMetadata);
  }

  async logout(input: { refreshToken?: string }): Promise<void> {
    if (!input.refreshToken) {
      return;
    }

    const verifiedToken = await this.safeVerifyRefreshToken(input.refreshToken);

    if (!verifiedToken) {
      return;
    }

    await this.authSessionRepository.revokeRefreshToken({
      revokedAt: new Date(),
      tokenId: verifiedToken.sessionId
    });
  }

  private async buildRefreshTokenRecord(
    userId: string,
    familyId: string,
    sessionMetadata: AuthSessionMetadata
  ): Promise<{
    rawToken: string;
    record: CreateRefreshTokenRecord;
  }> {
    const issuedAt = new Date();
    const sessionId = randomUUID();
    const expiresAt = new Date(
      issuedAt.getTime() + env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );
    const rawToken = await this.tokenService.issueRefreshToken({
      familyId,
      sessionId,
      userId
    });

    return {
      rawToken,
      record: {
        expiresAt,
        familyId,
        id: sessionId,
        ipAddress: sessionMetadata.ipAddress,
        issuedAt,
        tokenHash: hashToken(rawToken),
        userAgent: sessionMetadata.userAgent,
        userId
      }
    };
  }

  private async issueTokens(
    user: UserRecord,
    sessionMetadata: AuthSessionMetadata
  ): Promise<AuthResponse> {
    const familyId = randomUUID();
    const refreshToken = await this.buildRefreshTokenRecord(
      user.id,
      familyId,
      sessionMetadata
    );

    await this.authSessionRepository.createRefreshToken(refreshToken.record);

    const accessToken = await this.tokenService.issueAccessToken(
      buildAccessTokenPayload(user)
    );

    return {
      accessToken,
      refreshToken: refreshToken.rawToken,
      user: buildAuthUser(user)
    };
  }

  private async safeVerifyRefreshToken(
    refreshToken: string
  ): Promise<RefreshTokenPayload | null> {
    try {
      return await this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      return null;
    }
  }
}

const buildAccessTokenPayload = (user: UserRecord): AccessTokenPayload => ({
  email: user.email,
  permissions: user.permissions,
  roles: user.roles,
  userId: user.id
});

const buildAuthUser = (user: UserRecord) => ({
  email: user.email,
  id: user.id,
  permissions: user.permissions,
  roles: user.roles,
  status: user.status
});

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const normalizeEmail = (email: string) => email.trim().toLowerCase();
