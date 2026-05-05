import { env } from "@/config/env";
import { InventoryService } from "@/modules/inventory/application/services/inventory.service";
import { PrismaInventoryRepository } from "@/modules/inventory/infrastructure/repositories/prisma-inventory.repository";
import { logger } from "@/shared/observability/logger";

export class InventoryReservationExpiryWorker {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly inventoryService: InventoryService = new InventoryService(
      new PrismaInventoryRepository()
    )
  ) {}

  async runOnce() {
    const expiredReservations =
      await this.inventoryService.expirePendingReservations();

    if (expiredReservations.length > 0) {
      logger.info(
        {
          count: expiredReservations.length
        },
        "Expired inventory reservations"
      );
    }

    return expiredReservations;
  }

  start() {
    if (this.interval !== null) {
      return;
    }

    this.interval = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        logger.error({ error }, "Inventory reservation expiry worker failed");
      });
    }, env.INVENTORY_RESERVATION_EXPIRY_INTERVAL_MS);
  }

  stop() {
    if (this.interval === null) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }
}
