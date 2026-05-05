export type InventoryItemRecord = {
  availableQty: number;
  id: string;
  onHandQty: number;
  reservedQty: number;
  sku: string;
  updatedAt: Date;
  version: number;
  warehouseId: string;
};

export type InventoryReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "RELEASED"
  | "EXPIRED";

export type InventoryReservationRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  orderId: string;
  quantity: number;
  sku: string;
  status: InventoryReservationStatus;
  updatedAt: Date;
  warehouseId: string;
};

export type InventoryReservationLineInput = {
  quantity: number;
  sku: string;
};

export type InventoryReservationResult = {
  expiresAt: Date;
  reservations: InventoryReservationRecord[];
};

export type ListInventoryItemsFilters = {
  limit: number;
  sku?: string | undefined;
  warehouseId?: string | undefined;
};

export interface InventoryRepository {
  adjustOnHand(input: {
    quantityDelta: number;
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord>;
  confirmReservationsForOrder(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<InventoryReservationRecord[]>;
  expirePendingReservations(input: {
    expiredAt: Date;
    limit: number;
  }): Promise<InventoryReservationRecord[]>;
  findItem(input: {
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord | null>;
  listItems(filters: ListInventoryItemsFilters): Promise<InventoryItemRecord[]>;
  releaseReservationsForOrder(input: {
    orderId: string;
    releasedAt: Date;
  }): Promise<InventoryReservationRecord[]>;
  reserve(input: {
    expiresAt: Date;
    lines: InventoryReservationLineInput[];
    orderId: string;
    reservedAt: Date;
  }): Promise<InventoryReservationResult>;
  upsertItem(input: {
    onHandQty: number;
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord>;
}
