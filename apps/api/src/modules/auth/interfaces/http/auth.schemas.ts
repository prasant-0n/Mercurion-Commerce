import { z } from "zod";

import { env } from "@/config/env";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72)
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email()
});

export const passwordResetConfirmSchema = z.object({
  password: z.string().min(8).max(72),
  token: z.string().trim().min(32).max(256)
});

export const refreshCookieSchema = z.object({
  [env.AUTH_REFRESH_TOKEN_COOKIE_NAME]: z.string().min(1)
});

export const optionalRefreshCookieSchema = refreshCookieSchema.partial();
