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

export type UserRecord = {
  email: string;
  id: string;
  passwordHash: string;
  permissions: string[];
  roles: string[];
  status: UserStatus;
};

export interface AuthSessionRepository {
  createRefreshToken(record: CreateRefreshTokenRecord): Promise<void>;
  createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord>;
  findRefreshTokenById(id: string): Promise<RefreshTokenRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
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
