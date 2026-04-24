import { z } from "zod";

import { env } from "@/config/env";

export const authCredentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72)
});

export const refreshCookieSchema = z.object({
  [env.AUTH_REFRESH_TOKEN_COOKIE_NAME]: z.string().min(1)
});

export const optionalRefreshCookieSchema = refreshCookieSchema.partial();
