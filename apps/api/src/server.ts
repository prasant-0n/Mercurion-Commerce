import "dotenv/config";

import { initializeTracing } from "@/bootstrap/tracing";

const tracingHandle = initializeTracing();

const [{ createApp }, { startHttpServer }, { RuntimeState }] =
  await Promise.all([
    import("@/app"),
    import("@/bootstrap/start-http-server"),
    import("@/shared/runtime/runtime-state")
  ]);

const runtimeState = new RuntimeState();
const app = createApp(runtimeState);

startHttpServer(app, runtimeState, [tracingHandle.shutdown]);
