export type AppErrorOptions = {
  code: string;
  details?: Record<string, unknown> | undefined;
  isOperational?: boolean;
  message: string;
  statusCode: number;
};

export class AppError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly isOperational: boolean;
  readonly statusCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message);

    this.name = "AppError";
    this.code = options.code;
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    this.statusCode = options.statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "Resource not found",
    details?: Record<string, unknown>
  ) {
    super({
      code: "RESOURCE_NOT_FOUND",
      details,
      message,
      statusCode: 404
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: Record<string, unknown>) {
    super({
      code: "UNAUTHORIZED",
      details,
      message,
      statusCode: 401
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super({
      code: "BAD_REQUEST",
      details,
      message,
      statusCode: 400
    });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: Record<string, unknown>) {
    super({
      code: "CONFLICT",
      details,
      message,
      statusCode: 409
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super({
      code: "FORBIDDEN",
      details,
      message,
      statusCode: 403
    });
  }
}
