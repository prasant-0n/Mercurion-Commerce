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
