import type { UserStatus } from "@prisma/client";

export type CreateRefreshTokenRecord = {
  expiresAt: Date;
  familyId: string;
  id: string;
  ipAddress: string | undefined;
  issuedAt: Date;
  tokenHash: string;
  userAgent: string | undefined;
  userId: string;
};

export type RefreshTokenRecord = {
  expiresAt: Date;
  familyId: string;
  id: string;
  revokedAt: Date | undefined;
  tokenHash: string;
  userId: string;
};

export type CreatePasswordResetTokenRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  tokenHash: string;
  userId: string;
};

export type PasswordResetTokenRecord = {
  consumedAt: Date | undefined;
  expiresAt: Date;
  id: string;
  revokedAt: Date | undefined;
  tokenHash: string;
  userId: string;
};

export type UserRecord = {
  email: string;
  id: string;
  passwordHash: string;
  permissions: string[];
  roles: string[];
  status: UserStatus;
};

export interface AuthSessionRepository {
  createPasswordResetToken(
    record: CreatePasswordResetTokenRecord
  ): Promise<void>;
  createRefreshToken(record: CreateRefreshTokenRecord): Promise<void>;
  createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord>;
  findPasswordResetTokenByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetTokenRecord | null>;
  findRefreshTokenById(id: string): Promise<RefreshTokenRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  replacePasswordUsingResetToken(input: {
    consumedAt: Date;
    newPasswordHash: string;
    passwordResetTokenId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<boolean>;
  revokeAllRefreshTokensForUser(input: {
    revokedAt: Date;
    userId: string;
  }): Promise<void>;
  revokeOutstandingPasswordResetTokens(input: {
    excludeTokenId?: string;
    revokedAt: Date;
    userId: string;
  }): Promise<void>;
  revokeRefreshToken(input: {
    revokedAt: Date;
    tokenId: string;
  }): Promise<void>;
  revokeRefreshTokenFamily(input: {
    familyId: string;
    revokedAt: Date;
  }): Promise<void>;
  rotateRefreshToken(input: {
    currentTokenId: string;
    revokedAt: Date;
    replacementToken: CreateRefreshTokenRecord;
  }): Promise<void>;
}
