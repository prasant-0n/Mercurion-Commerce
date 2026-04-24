import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT
} from "@opentelemetry/semantic-conventions";

import { env } from "@/config/env";
import { logger } from "@/shared/observability/logger";

export type TracingHandle = {
  shutdown: () => Promise<void>;
};

let sdk: NodeSDK | null = null;

export const initializeTracing = (): TracingHandle => {
  if (!env.OTEL_ENABLED) {
    return {
      shutdown: async () => {}
    };
  }

  if (sdk) {
    return {
      shutdown: shutdownTracing
    };
  }

  diag.setLogger(new DiagConsoleLogger(), mapDiagLevel(env.LOG_LEVEL));

  sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false
        }
      })
    ],
    resource: resourceFromAttributes({
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
      [ATTR_SERVICE_NAME]: env.APP_NAME,
      [ATTR_SERVICE_VERSION]: env.OTEL_SERVICE_VERSION
    }),
    traceExporter: new ConsoleSpanExporter()
  });

  sdk.start();
  logger.info(
    {
      environment: env.NODE_ENV,
      serviceVersion: env.OTEL_SERVICE_VERSION
    },
    "OpenTelemetry tracing initialized"
  );

  return {
    shutdown: shutdownTracing
  };
};

const shutdownTracing = async () => {
  if (!sdk) {
    return;
  }

  await sdk.shutdown();
  sdk = null;
  logger.info("OpenTelemetry tracing shutdown complete");
};

const mapDiagLevel = (level: typeof env.LOG_LEVEL): DiagLogLevel => {
  switch (level) {
    case "fatal":
    case "error":
      return DiagLogLevel.ERROR;
    case "warn":
      return DiagLogLevel.WARN;
    case "info":
      return DiagLogLevel.INFO;
    case "debug":
      return DiagLogLevel.DEBUG;
    case "trace":
      return DiagLogLevel.VERBOSE;
    case "silent":
      return DiagLogLevel.NONE;
  }
};
