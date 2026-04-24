import "dotenv/config";

import { createApp } from "@/app";
import { startHttpServer } from "@/bootstrap/start-http-server";
import { RuntimeState } from "@/shared/runtime/runtime-state";

const runtimeState = new RuntimeState();
const app = createApp(runtimeState);

startHttpServer(app, runtimeState);
