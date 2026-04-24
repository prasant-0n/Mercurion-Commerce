import "express-serve-static-core";

import type { Logger } from "pino";

import type { AccessTokenPayload } from "@/modules/auth/application/ports/token-service";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AccessTokenPayload;
    log: Logger;
    requestId: string;
  }
}
