import { env } from "@/config/env";
import type {
  InventoryItemRecord,
  InventoryRepository,
  InventoryReservationLineInput,
  InventoryReservationRecord,
  ListInventoryItemsFilters
} from "@/modules/inventory/application/ports/inventory.repository";
import {
  AppError,
  BadRequestError,
  NotFoundError
} from "@/shared/errors/app-error";

type UpsertInventoryItemInput = {
  onHandQty: number;
  sku: string;
  warehouseId: string;
};

type AdjustInventoryItemInput = {
  quantityDelta: number;
  sku: string;
  warehouseId: string;
};

type ReserveInventoryInput = {
  expiresAt?: Date | undefined;
  lines: InventoryReservationLineInput[];
  orderId: string;
};

type InventoryMetricsSnapshot = {
  expiredReservations: number;
  reservationConflicts: number;
  reservationUnavailable: number;
};

export class InventoryService {
  private readonly metrics: InventoryMetricsSnapshot = {
    expiredReservations: 0,
    reservationConflicts: 0,
    reservationUnavailable: 0
  };

  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async adjustOnHand(
    input: AdjustInventoryItemInput
  ): Promise<InventoryItemRecord> {
    const normalized = {
      quantityDelta: input.quantityDelta,
      sku: normalizeSku(input.sku),
      warehouseId: input.warehouseId
    };

    validateSku(normalized.sku);
    validateQuantityDelta(normalized.quantityDelta);

    try {
      return await this.inventoryRepository.adjustOnHand(normalized);
    } catch (error) {
      throw mapInventoryStorageError(error);
    }
  }

  async confirmReservationsForOrder(
    orderId: string
  ): Promise<InventoryReservationRecord[]> {
    return this.inventoryRepository.confirmReservationsForOrder({
      confirmedAt: this.now(),
      orderId
    });
  }

  async expirePendingReservations(
    limit = env.INVENTORY_RESERVATION_EXPIRY_BATCH_SIZE
  ): Promise<InventoryReservationRecord[]> {
    const expiredReservations =
      await this.inventoryRepository.expirePendingReservations({
        expiredAt: this.now(),
        limit
      });

    this.metrics.expiredReservations += expiredReservations.length;

    return expiredReservations;
  }

  getMetrics(): InventoryMetricsSnapshot {
    return {
      ...this.metrics
    };
  }

  async getItem(input: {
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord> {
    const item = await this.inventoryRepository.findItem({
      sku: normalizeSku(input.sku),
      warehouseId: input.warehouseId
    });

    if (!item) {
      throw new NotFoundError("Inventory item not found", {
        sku: input.sku,
        warehouseId: input.warehouseId
      });
    }

    return item;
  }

  async listItems(
    filters: ListInventoryItemsFilters
  ): Promise<InventoryItemRecord[]> {
    return this.inventoryRepository.listItems({
      ...filters,
      sku: filters.sku ? normalizeSku(filters.sku) : undefined
    });
  }

  async releaseReservationsForOrder(
    orderId: string
  ): Promise<InventoryReservationRecord[]> {
    return this.inventoryRepository.releaseReservationsForOrder({
      orderId,
      releasedAt: this.now()
    });
  }

  async reserve(input: ReserveInventoryInput) {
    const lines = normalizeReservationLines(input.lines);
    const reservedAt = this.now();
    const expiresAt =
      input.expiresAt ??
      new Date(
        reservedAt.getTime() + env.INVENTORY_RESERVATION_TTL_SECONDS * 1000
      );

    try {
      return await this.inventoryRepository.reserve({
        expiresAt,
        lines,
        orderId: input.orderId,
        reservedAt
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "INVENTORY_CONTENTION") {
        this.metrics.reservationConflicts += 1;
      }

      if (error instanceof AppError && error.code === "INVENTORY_UNAVAILABLE") {
        this.metrics.reservationUnavailable += 1;
      }

      throw error;
    }
  }

  async upsertItem(
    input: UpsertInventoryItemInput
  ): Promise<InventoryItemRecord> {
    const normalized = {
      onHandQty: input.onHandQty,
      sku: normalizeSku(input.sku),
      warehouseId: input.warehouseId
    };

    validateSku(normalized.sku);
    validateNonNegativeQuantity(normalized.onHandQty);

    return this.inventoryRepository.upsertItem(normalized);
  }
}

const normalizeReservationLines = (
  lines: InventoryReservationLineInput[]
): InventoryReservationLineInput[] => {
  if (lines.length === 0) {
    throw new BadRequestError("Reservation requires at least one line");
  }

  const quantityBySku = new Map<string, number>();

  for (const line of lines) {
    const sku = normalizeSku(line.sku);
    validateSku(sku);
    validatePositiveQuantity(line.quantity);
    quantityBySku.set(sku, (quantityBySku.get(sku) ?? 0) + line.quantity);
  }

  return Array.from(quantityBySku.entries()).map(([sku, quantity]) => ({
    quantity,
    sku
  }));
};

const mapInventoryStorageError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    code: "INVENTORY_UPDATE_FAILED",
    message: "Inventory update failed",
    statusCode: 409
  });
};

const normalizeSku = (sku: string) => sku.trim();

const validateNonNegativeQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new BadRequestError(
      "Inventory quantity must be a non-negative integer"
    );
  }
};

const validatePositiveQuantity = (quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BadRequestError(
      "Reservation quantity must be a positive integer"
    );
  }
};

const validateQuantityDelta = (quantityDelta: number) => {
  if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
    throw new BadRequestError(
      "Inventory adjustment must be a non-zero integer"
    );
  }
};

const validateSku = (sku: string) => {
  if (sku.length === 0 || sku.length > 128) {
    throw new BadRequestError("Inventory SKU is invalid");
  }
};

export const mapInventoryItemResponse = (item: InventoryItemRecord) => ({
  availableQty: item.availableQty,
  id: item.id,
  onHandQty: item.onHandQty,
  reservedQty: item.reservedQty,
  sku: item.sku,
  updatedAt: item.updatedAt.toISOString(),
  version: item.version,
  warehouseId: item.warehouseId
});

export const mapInventoryItemsResponse = (items: InventoryItemRecord[]) => ({
  count: items.length,
  items: items.map(mapInventoryItemResponse)
});

export const mapInventoryReservationResponse = (
  reservation: InventoryReservationRecord
) => ({
  createdAt: reservation.createdAt.toISOString(),
  expiresAt: reservation.expiresAt.toISOString(),
  id: reservation.id,
  orderId: reservation.orderId,
  quantity: reservation.quantity,
  sku: reservation.sku,
  status: reservation.status,
  updatedAt: reservation.updatedAt.toISOString(),
  warehouseId: reservation.warehouseId
});

export const mapInventoryReservationsResponse = (
  reservations: InventoryReservationRecord[]
) => ({
  count: reservations.length,
  reservations: reservations.map(mapInventoryReservationResponse)
});
