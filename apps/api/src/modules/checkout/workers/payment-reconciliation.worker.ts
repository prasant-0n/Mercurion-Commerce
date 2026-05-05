import { env } from "@/config/env";
import { CheckoutService } from "@/modules/checkout/application/services/checkout.service";
import { logger } from "@/shared/observability/logger";

export class PaymentReconciliationWorker {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly checkoutService: CheckoutService = new CheckoutService()
  ) {}

  async runOnce() {
    const result = await this.checkoutService.reconcileStalePayments();

    if (result.reconciledCount > 0) {
      logger.info(result, "Reconciled stale payment attempts");
    }

    return result;
  }

  start() {
    if (this.interval !== null) {
      return;
    }

    this.interval = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        logger.error({ error }, "Payment reconciliation worker failed");
      });
    }, env.PAYMENT_RECONCILIATION_INTERVAL_MS);
  }

  stop() {
    if (this.interval === null) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }
}
