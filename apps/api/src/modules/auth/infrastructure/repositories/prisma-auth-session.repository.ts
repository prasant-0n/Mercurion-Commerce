import { UserStatus } from "@prisma/client";

import type {
  AuthSessionRepository,
  CreateRefreshTokenRecord,
  RefreshTokenRecord,
  UserRecord
} from "@/modules/auth/application/ports/auth-session.repository";
import { prisma } from "@/shared/infrastructure/prisma/prisma-client";

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  async createRefreshToken(record: CreateRefreshTokenRecord): Promise<void> {
    await prisma.refreshToken.create({
      data: buildRefreshTokenCreateData(record)
    });
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        status: UserStatus.ACTIVE
      }
    });

    return mapUserRecord(user);
  }

  async findRefreshTokenById(id: string): Promise<RefreshTokenRecord | null> {
    const token = await prisma.refreshToken.findUnique({
      where: { id }
    });

    if (!token) {
      return null;
    }

    return {
      expiresAt: token.expiresAt,
      familyId: token.familyId,
      id: token.id,
      revokedAt: token.revokedAt ?? undefined,
      tokenHash: token.tokenHash,
      userId: token.userId
    };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    return user ? mapUserRecord(user) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({
      where: { id }
    });

    return user ? mapUserRecord(user) : null;
  }

  async revokeRefreshToken(input: {
    revokedAt: Date;
    tokenId: string;
  }): Promise<void> {
    await prisma.refreshToken.updateMany({
      data: {
        revokedAt: input.revokedAt
      },
      where: {
        id: input.tokenId,
        revokedAt: null
      }
    });
  }

  async revokeRefreshTokenFamily(input: {
    familyId: string;
    revokedAt: Date;
  }): Promise<void> {
    await prisma.refreshToken.updateMany({
      data: {
        revokedAt: input.revokedAt
      },
      where: {
        familyId: input.familyId,
        revokedAt: null
      }
    });
  }

  async rotateRefreshToken(input: {
    currentTokenId: string;
    revokedAt: Date;
    replacementToken: CreateRefreshTokenRecord;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.refreshToken.update({
        data: {
          replacedByTokenId: input.replacementToken.id,
          revokedAt: input.revokedAt
        },
        where: {
          id: input.currentTokenId
        }
      }),
      prisma.refreshToken.create({
        data: buildRefreshTokenCreateData(input.replacementToken)
      })
    ]);
  }
}

const buildRefreshTokenCreateData = (record: CreateRefreshTokenRecord) => ({
  expiresAt: record.expiresAt,
  familyId: record.familyId,
  id: record.id,
  ipAddress: record.ipAddress ?? null,
  issuedAt: record.issuedAt,
  tokenHash: record.tokenHash,
  userAgent: record.userAgent ?? null,
  userId: record.userId
});

const mapUserRecord = (user: {
  email: string;
  id: string;
  passwordHash: string;
  status: UserStatus;
}): UserRecord => ({
  email: user.email,
  id: user.id,
  passwordHash: user.passwordHash,
  status: user.status
});
