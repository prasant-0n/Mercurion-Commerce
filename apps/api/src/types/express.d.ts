import "express-serve-static-core";

import type { Logger } from "pino";

declare module "express-serve-static-core" {
  interface Request {
    log: Logger;
    requestId: string;
  }
}
