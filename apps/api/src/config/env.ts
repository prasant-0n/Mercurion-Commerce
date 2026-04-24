import { z } from "zod";

const envSchema = z.object({
  API_PREFIX: z.string().min(1).default("/api/v1"),
  APP_NAME: z.string().min(1).default("ecommerce-api"),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000)
});

export const env = envSchema.parse(process.env);
