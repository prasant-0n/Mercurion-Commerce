import "dotenv/config";

import { initializeTracing } from "@/bootstrap/tracing";
import { env } from "@/config/env";
import { PaymentReconciliationWorker } from "@/modules/checkout/workers/payment-reconciliation.worker";
import { InventoryReservationExpiryWorker } from "@/modules/inventory/workers/reservation-expiry.worker";
import { closeMongoClient } from "@/shared/infrastructure/mongo/mongo-client";
import { closeRedisClient } from "@/shared/infrastructure/redis/redis-client";

const tracingHandle = initializeTracing();

const [{ createApp }, { startHttpServer }, { RuntimeState }] =
  await Promise.all([
    import("@/app"),
    import("@/bootstrap/start-http-server"),
    import("@/shared/runtime/runtime-state")
  ]);

const runtimeState = new RuntimeState();
const app = createApp(runtimeState);
const inventoryReservationExpiryWorker = new InventoryReservationExpiryWorker();
const paymentReconciliationWorker = new PaymentReconciliationWorker();

if (env.WORKERS_ENABLED) {
  inventoryReservationExpiryWorker.start();
  paymentReconciliationWorker.start();
}

startHttpServer(app, runtimeState, [
  () => {
    inventoryReservationExpiryWorker.stop();
    paymentReconciliationWorker.stop();
    return Promise.resolve();
  },
  tracingHandle.shutdown,
  closeRedisClient,
  closeMongoClient
]);
