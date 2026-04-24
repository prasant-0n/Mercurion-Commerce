import pino from "pino";

import { env } from "@/config/env";

export const logger = pino({
  base: {
    service: env.APP_NAME
  },
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']"
    ],
    remove: true
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
