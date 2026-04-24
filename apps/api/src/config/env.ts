import { z } from "zod";

const envSchema = z.object({
  API_PREFIX: z.string().min(1).default("/api/v1"),
  APP_NAME: z.string().min(1).default("ecommerce-api"),
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),
  AUTH_BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  AUTH_JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default("dev-access-secret-change-me-at-least-32-chars"),
  AUTH_JWT_REFRESH_SECRET: z
    .string()
    .min(32)
    .default("dev-refresh-secret-change-me-at-least-32-chars"),
  AUTH_REFRESH_TOKEN_COOKIE_NAME: z.string().min(1).default("refresh_token"),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  DATABASE_URL: z
    .string()
    .min(1)
    .default(
      "postgresql://postgres:postgres@localhost:5432/ecommerce_platform?schema=public"
    ),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  HOST: z.string().min(1).default("0.0.0.0"),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_SERVICE_VERSION: z.string().min(1).default("0.1.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000)
});

export const env = envSchema.parse(process.env);
