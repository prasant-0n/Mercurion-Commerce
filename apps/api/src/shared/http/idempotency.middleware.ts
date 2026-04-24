import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { Request, RequestHandler, Response } from "express";

import { env } from "@/config/env";
import { AppError } from "@/shared/errors/app-error";
import { asyncHandler } from "@/shared/http/async-handler";
import { PrismaIdempotencyRecordRepository } from "@/shared/infrastructure/prisma/prisma-idempotency-record.repository";

type IdempotencyMiddlewareOptions = {
  requireKey?: boolean;
  scope?: (request: Request) => string;
};

const defaultRepository = new PrismaIdempotencyRecordRepository();
const idempotencyHeaderName = "idempotency-key";

export const createIdempotencyMiddleware = (
  options: IdempotencyMiddlewareOptions = {}
): RequestHandler =>
  asyncHandler(async (request, response, next) => {
    const idempotencyKey = request.get(idempotencyHeaderName)?.trim();

    if (!idempotencyKey) {
      if (options.requireKey ?? true) {
        throw new AppError({
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message: "Idempotency-Key header is required",
          statusCode: 400
        });
      }

      return next();
    }

    const scope = options.scope?.(request) ?? buildScope(request);
    const requestHash = buildRequestHash(request.body);
    const existingRecord = await defaultRepository.findByScopeAndKey({
      key: idempotencyKey,
      scope
    });

    if (existingRecord && existingRecord.expiresAt.getTime() > Date.now()) {
      return handleExistingRecord({
        existingRecord,
        requestHash,
        response
      });
    }

    const expirationTime = new Date(
      Date.now() + env.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
    );

    if (existingRecord) {
      const wasReused = await defaultRepository.reuseExpired({
        expiresAt: expirationTime,
        key: idempotencyKey,
        requestHash,
        scope
      });

      if (wasReused) {
        persistResponse({
          key: idempotencyKey,
          response,
          scope
        });

        return next();
      }
    }

    const claimResult = await claimIdempotencyKey({
      expiresAt: expirationTime,
      key: idempotencyKey,
      requestHash,
      scope
    });

    if (claimResult.status === "existing") {
      return handleExistingRecord({
        existingRecord: claimResult.record,
        requestHash,
        response
      });
    }

    persistResponse({
      key: idempotencyKey,
      response,
      scope
    });

    return next();
  });

const claimIdempotencyKey = async (input: {
  expiresAt: Date;
  key: string;
  requestHash: string;
  scope: string;
}): Promise<
  | { status: "claimed" }
  | {
      record: {
        requestHash: string;
        responseBody: Prisma.JsonValue | null;
        responseCode: number | null;
      };
      status: "existing";
    }
> => {
  try {
    await defaultRepository.createPending({
      expiresAt: input.expiresAt,
      key: input.key,
      requestHash: input.requestHash,
      scope: input.scope
    });

    return {
      status: "claimed"
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingRecord = await defaultRepository.findByScopeAndKey({
        key: input.key,
        scope: input.scope
      });

      if (!existingRecord || existingRecord.expiresAt.getTime() <= Date.now()) {
        throw new AppError({
          code: "IDEMPOTENCY_CLAIM_FAILED",
          message: "Failed to claim idempotency key",
          statusCode: 409
        });
      }

      if (existingRecord.requestHash !== input.requestHash) {
        throw new AppError({
          code: "IDEMPOTENCY_KEY_REUSED",
          details: {
            scope: input.scope
          },
          message:
            "Idempotency key has already been used with a different request payload",
          statusCode: 422
        });
      }

      if (existingRecord.responseCode === null) {
        throw new AppError({
          code: "IDEMPOTENCY_IN_PROGRESS",
          message: "An identical request is already being processed",
          statusCode: 409
        });
      }

      return {
        record: {
          requestHash: existingRecord.requestHash,
          responseBody: existingRecord.responseBody,
          responseCode: existingRecord.responseCode
        },
        status: "existing"
      };
    }

    throw error;
  }
};

const handleExistingRecord = (input: {
  existingRecord: {
    requestHash: string;
    responseBody: Prisma.JsonValue | null;
    responseCode: number | null;
  };
  requestHash: string;
  response: Response;
}) => {
  if (input.existingRecord.requestHash !== input.requestHash) {
    throw new AppError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message:
        "Idempotency key has already been used with a different request payload",
      statusCode: 422
    });
  }

  if (input.existingRecord.responseCode === null) {
    throw new AppError({
      code: "IDEMPOTENCY_IN_PROGRESS",
      message: "An identical request is already being processed",
      statusCode: 409
    });
  }

  input.response.setHeader("x-idempotency-replayed", "true");

  if (input.existingRecord.responseBody === null) {
    input.response.status(input.existingRecord.responseCode).send();
    return;
  }

  input.response
    .status(input.existingRecord.responseCode)
    .json(input.existingRecord.responseBody);
};

const persistResponse = (input: {
  key: string;
  response: Response;
  scope: string;
}) => {
  let responseBody: Prisma.JsonValue | null = null;
  let responseCaptured = false;

  const originalJson = input.response.json.bind(input.response);
  const originalSend = input.response.send.bind(input.response);

  input.response.json = ((body: Prisma.JsonValue) => {
    responseBody = body;
    responseCaptured = true;

    return originalJson(body);
  }) as Response["json"];

  input.response.send = ((body?: unknown) => {
    if (!responseCaptured) {
      responseBody = normalizeResponseBody(body);
      responseCaptured = true;
    }

    return originalSend(body);
  }) as Response["send"];

  input.response.once("finish", () => {
    void defaultRepository
      .saveResponse({
        key: input.key,
        responseBody: toPrismaJsonValue(responseBody),
        responseCode: input.response.statusCode,
        scope: input.scope
      })
      .catch((error: unknown) => {
        input.response.req.log.error(
          {
            error,
            idempotencyKey: input.key,
            scope: input.scope
          },
          "Failed to persist idempotent response"
        );
      });
  });
};

const buildScope = (request: Request) => {
  const userScope = request.auth?.userId ?? "anonymous";
  const path = request.originalUrl.split("?")[0];

  return `${request.method}:${path}:${userScope}`;
};

const buildRequestHash = (payload: unknown) =>
  createHash("sha256").update(stableStringify(payload)).digest("hex");

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right)
  );

  return `{${entries
    .map(
      ([key, nestedValue]) =>
        `${JSON.stringify(key)}:${stableStringify(nestedValue)}`
    )
    .join(",")}}`;
};

const normalizeResponseBody = (body: unknown): Prisma.JsonValue | null => {
  if (typeof body === "undefined") {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  if (
    body === null ||
    typeof body === "string" ||
    typeof body === "number" ||
    typeof body === "boolean"
  ) {
    return body;
  }

  return JSON.parse(JSON.stringify(body)) as Prisma.JsonValue;
};

const toPrismaJsonValue = (
  body: Prisma.JsonValue | null
): Prisma.InputJsonValue | null => (body === null ? null : body);
