import { describe, expect, it } from "vitest";

import type {
  InventoryItemRecord,
  InventoryRepository,
  InventoryReservationLineInput,
  InventoryReservationRecord
} from "@/modules/inventory/application/ports/inventory.repository";
import { InventoryService } from "@/modules/inventory/application/services/inventory.service";
import { AppError } from "@/shared/errors/app-error";

describe("InventoryService", () => {
  it("normalizes duplicate reservation lines before reserving", async () => {
    const repository = new FakeInventoryRepository();
    const service = new InventoryService(repository);

    await service.reserve({
      lines: [
        {
          quantity: 1,
          sku: " SKU-1 "
        },
        {
          quantity: 2,
          sku: "SKU-1"
        }
      ],
      orderId: "00000000-0000-4000-8000-000000000001"
    });

    expect(repository.lastReservationLines).toEqual([
      {
        quantity: 3,
        sku: "SKU-1"
      }
    ]);
  });

  it("increments unavailable metrics when reservation fails", async () => {
    const repository = new FakeInventoryRepository({
      reserveError: new AppError({
        code: "INVENTORY_UNAVAILABLE",
        message: "Inventory unavailable",
        statusCode: 409
      })
    });
    const service = new InventoryService(repository);

    await expect(
      service.reserve({
        lines: [
          {
            quantity: 1,
            sku: "SKU-1"
          }
        ],
        orderId: "00000000-0000-4000-8000-000000000001"
      })
    ).rejects.toMatchObject({
      code: "INVENTORY_UNAVAILABLE"
    });

    expect(service.getMetrics()).toMatchObject({
      reservationUnavailable: 1
    });
  });

  it("tracks expired reservations", async () => {
    const repository = new FakeInventoryRepository({
      expiredReservations: [
        buildReservation("00000000-0000-4000-8000-000000000001")
      ]
    });
    const service = new InventoryService(repository);

    await service.expirePendingReservations();

    expect(service.getMetrics()).toMatchObject({
      expiredReservations: 1
    });
  });
});

class FakeInventoryRepository implements InventoryRepository {
  lastReservationLines: InventoryReservationLineInput[] = [];

  constructor(
    private readonly options: {
      expiredReservations?: InventoryReservationRecord[];
      reserveError?: Error;
    } = {}
  ) {}

  adjustOnHand(): Promise<InventoryItemRecord> {
    return Promise.resolve(buildItem());
  }

  confirmReservationsForOrder(): Promise<InventoryReservationRecord[]> {
    return Promise.resolve([]);
  }

  expirePendingReservations(): Promise<InventoryReservationRecord[]> {
    return Promise.resolve(this.options.expiredReservations ?? []);
  }

  findItem(): Promise<InventoryItemRecord | null> {
    return Promise.resolve(buildItem());
  }

  listItems(): Promise<InventoryItemRecord[]> {
    return Promise.resolve([buildItem()]);
  }

  releaseReservationsForOrder(): Promise<InventoryReservationRecord[]> {
    return Promise.resolve([]);
  }

  reserve(input: {
    expiresAt: Date;
    lines: InventoryReservationLineInput[];
    orderId: string;
    reservedAt: Date;
  }) {
    this.lastReservationLines = input.lines;

    if (this.options.reserveError) {
      return Promise.reject(this.options.reserveError);
    }

    return Promise.resolve({
      expiresAt: input.expiresAt,
      reservations: input.lines.map((line) =>
        buildReservation(input.orderId, line.sku, line.quantity)
      )
    });
  }

  upsertItem(): Promise<InventoryItemRecord> {
    return Promise.resolve(buildItem());
  }
}

const buildItem = (): InventoryItemRecord => ({
  availableQty: 10,
  id: "00000000-0000-4000-8000-000000000010",
  onHandQty: 10,
  reservedQty: 0,
  sku: "SKU-1",
  updatedAt: new Date("2026-05-06T10:00:00.000Z"),
  version: 1,
  warehouseId: "00000000-0000-4000-8000-000000000020"
});

const buildReservation = (
  orderId: string,
  sku = "SKU-1",
  quantity = 1
): InventoryReservationRecord => ({
  createdAt: new Date("2026-05-06T10:00:00.000Z"),
  expiresAt: new Date("2026-05-06T10:15:00.000Z"),
  id: "00000000-0000-4000-8000-000000000030",
  orderId,
  quantity,
  sku,
  status: "PENDING",
  updatedAt: new Date("2026-05-06T10:00:00.000Z"),
  warehouseId: "00000000-0000-4000-8000-000000000020"
});
