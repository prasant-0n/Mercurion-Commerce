import bcrypt from "bcryptjs";

import { env } from "@/config/env";
import type { PasswordHasher } from "@/modules/auth/application/ports/password-hasher";

export class BcryptPasswordHasher implements PasswordHasher {
  async compare(plainText: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainText, passwordHash);
  }

  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, env.AUTH_BCRYPT_SALT_ROUNDS);
  }
}
