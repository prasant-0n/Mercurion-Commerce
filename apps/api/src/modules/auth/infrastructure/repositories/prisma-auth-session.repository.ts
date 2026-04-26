import { UserStatus } from "@prisma/client";

import type {
  AuthSessionRepository,
  CreatePasswordResetTokenRecord,
  CreateRefreshTokenRecord,
  PasswordResetTokenRecord,
  RefreshTokenRecord,
  UserRecord
} from "@/modules/auth/application/ports/auth-session.repository";
import { prisma } from "@/shared/infrastructure/prisma/prisma-client";

export class PrismaAuthSessionRepository implements AuthSessionRepository {
  async createPasswordResetToken(
    record: CreatePasswordResetTokenRecord
  ): Promise<void> {
    await prisma.passwordResetToken.create({
      data: {
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        id: record.id,
        tokenHash: record.tokenHash,
        userId: record.userId
      }
    });
  }

  async createRefreshToken(record: CreateRefreshTokenRecord): Promise<void> {
    await prisma.refreshToken.create({
      data: buildRefreshTokenCreateData(record)
    });
  }

  async createUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    const user = await prisma.$transaction(async (transaction) => {
      const customerRole = await transaction.role.findUnique({
        where: {
          name: "CUSTOMER"
        }
      });

      const createdUser = await transaction.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          status: UserStatus.ACTIVE
        }
      });

      if (customerRole) {
        await transaction.userRole.create({
          data: {
            roleId: customerRole.id,
            userId: createdUser.id
          }
        });
      }

      return transaction.user.findUniqueOrThrow({
        include: userWithRolesInclude,
        where: {
          id: createdUser.id
        }
      });
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

  async findPasswordResetTokenByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetTokenRecord | null> {
    const token = await prisma.passwordResetToken.findUnique({
      where: {
        tokenHash
      }
    });

    if (!token) {
      return null;
    }

    return {
      consumedAt: token.consumedAt ?? undefined,
      expiresAt: token.expiresAt,
      id: token.id,
      revokedAt: token.revokedAt ?? undefined,
      tokenHash: token.tokenHash,
      userId: token.userId
    };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({
      include: userWithRolesInclude,
      where: { email }
    });

    return user ? mapUserRecord(user) : null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({
      include: userWithRolesInclude,
      where: { id }
    });

    return user ? mapUserRecord(user) : null;
  }

  async replacePasswordUsingResetToken(input: {
    consumedAt: Date;
    newPasswordHash: string;
    passwordResetTokenId: string;
    revokedAt: Date;
    userId: string;
  }): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      const consumedToken = await transaction.passwordResetToken.updateMany({
        data: {
          consumedAt: input.consumedAt
        },
        where: {
          consumedAt: null,
          expiresAt: {
            gt: input.consumedAt
          },
          id: input.passwordResetTokenId,
          revokedAt: null,
          userId: input.userId
        }
      });

      if (consumedToken.count !== 1) {
        return false;
      }

      await transaction.user.update({
        data: {
          passwordHash: input.newPasswordHash
        },
        where: {
          id: input.userId
        }
      });

      await transaction.refreshToken.updateMany({
        data: {
          revokedAt: input.revokedAt
        },
        where: {
          revokedAt: null,
          userId: input.userId
        }
      });

      await transaction.passwordResetToken.updateMany({
        data: {
          revokedAt: input.revokedAt
        },
        where: {
          consumedAt: null,
          id: {
            not: input.passwordResetTokenId
          },
          revokedAt: null,
          userId: input.userId
        }
      });

      return true;
    });
  }

  async revokeAllRefreshTokensForUser(input: {
    revokedAt: Date;
    userId: string;
  }): Promise<void> {
    await prisma.refreshToken.updateMany({
      data: {
        revokedAt: input.revokedAt
      },
      where: {
        revokedAt: null,
        userId: input.userId
      }
    });
  }

  async revokeOutstandingPasswordResetTokens(input: {
    excludeTokenId?: string;
    revokedAt: Date;
    userId: string;
  }): Promise<void> {
    const excludedTokenFilter = input.excludeTokenId
      ? {
          id: {
            not: input.excludeTokenId
          }
        }
      : {};

    await prisma.passwordResetToken.updateMany({
      data: {
        revokedAt: input.revokedAt
      },
      where: {
        consumedAt: null,
        revokedAt: null,
        userId: input.userId,
        ...excludedTokenFilter
      }
    });
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
  userRoles: Array<{
    role: {
      name: string;
      rolePermissions: Array<{
        permission: {
          name: string;
        };
      }>;
    };
  }>;
  status: UserStatus;
}): UserRecord => ({
  email: user.email,
  id: user.id,
  passwordHash: user.passwordHash,
  permissions: Array.from(
    new Set(
      user.userRoles.flatMap((userRole) =>
        userRole.role.rolePermissions.map(
          (rolePermission) => rolePermission.permission.name
        )
      )
    )
  ),
  roles: user.userRoles.map((userRole) => userRole.role.name),
  status: user.status
});

const userWithRolesInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  }
} as const;
