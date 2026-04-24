import { Prisma } from "@prisma/client";

import { prisma } from "@/shared/infrastructure/prisma/prisma-client";

export type IdempotencyRecord = {
  expiresAt: Date;
  key: string;
  requestHash: string;
  responseBody: Prisma.JsonValue | null;
  responseCode: number | null;
  scope: string;
};

export class PrismaIdempotencyRecordRepository {
  async createPending(input: {
    expiresAt: Date;
    key: string;
    requestHash: string;
    scope: string;
  }): Promise<void> {
    await prisma.idempotencyRecord.create({
      data: {
        expiresAt: input.expiresAt,
        key: input.key,
        requestHash: input.requestHash,
        scope: input.scope
      }
    });
  }

  async findByScopeAndKey(input: {
    key: string;
    scope: string;
  }): Promise<IdempotencyRecord | null> {
    const record = await prisma.idempotencyRecord.findUnique({
      where: {
        scope_key: {
          key: input.key,
          scope: input.scope
        }
      }
    });

    if (!record) {
      return null;
    }

    return {
      expiresAt: record.expiresAt,
      key: record.key,
      requestHash: record.requestHash,
      responseBody: record.responseBody,
      responseCode: record.responseCode,
      scope: record.scope
    };
  }

  async reuseExpired(input: {
    expiresAt: Date;
    key: string;
    requestHash: string;
    scope: string;
  }): Promise<boolean> {
    const result = await prisma.idempotencyRecord.updateMany({
      data: {
        expiresAt: input.expiresAt,
        requestHash: input.requestHash,
        responseBody: Prisma.DbNull,
        responseCode: null
      },
      where: {
        expiresAt: {
          lte: new Date()
        },
        key: input.key,
        scope: input.scope
      }
    });

    return result.count > 0;
  }

  async saveResponse(input: {
    key: string;
    responseBody: Prisma.InputJsonValue | null;
    responseCode: number;
    scope: string;
  }): Promise<void> {
    await prisma.idempotencyRecord.update({
      data: {
        responseBody: input.responseBody ?? Prisma.DbNull,
        responseCode: input.responseCode
      },
      where: {
        scope_key: {
          key: input.key,
          scope: input.scope
        }
      }
    });
  }
}
