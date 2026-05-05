import { Prisma, type PrismaClient } from "@prisma/client";

import { env } from "@/config/env";
import type {
  InventoryItemRecord,
  InventoryRepository,
  InventoryReservationRecord,
  InventoryReservationResult,
  ListInventoryItemsFilters
} from "@/modules/inventory/application/ports/inventory.repository";
import { AppError, NotFoundError } from "@/shared/errors/app-error";
import { prisma } from "@/shared/infrastructure/prisma/prisma-client";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type RawInventoryItem = {
  available_qty: number;
  id: string;
  on_hand_qty: number;
  reserved_qty: number;
  sku: string;
  updated_at: Date;
  version: number;
  warehouse_id: string;
};

const retryBackoffMs = [15, 40, 100] as const;

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(
    private readonly client: PrismaClient = prisma,
    private readonly sleep: (durationMs: number) => Promise<void> = delay
  ) {}

  async adjustOnHand(input: {
    quantityDelta: number;
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord> {
    const rows = await this.client.$queryRaw<RawInventoryItem[]>`
      UPDATE inventory_items
      SET on_hand_qty = on_hand_qty + ${input.quantityDelta},
          version = version + 1,
          updated_at = now()
      WHERE sku = ${input.sku}
        AND warehouse_id = ${input.warehouseId}::uuid
        AND on_hand_qty + ${input.quantityDelta} >= 0
        AND on_hand_qty + ${input.quantityDelta} >= reserved_qty
      RETURNING id,
                sku,
                warehouse_id,
                on_hand_qty,
                reserved_qty,
                version,
                updated_at,
                on_hand_qty - reserved_qty AS available_qty
    `;

    const row = rows[0];

    if (row) {
      return mapRawInventoryItem(row);
    }

    const existingItem = await this.findItem(input);

    if (!existingItem) {
      throw new NotFoundError("Inventory item not found", {
        sku: input.sku,
        warehouseId: input.warehouseId
      });
    }

    throw new AppError({
      code: "INVENTORY_ADJUSTMENT_INVALID",
      details: {
        reservedQty: existingItem.reservedQty,
        sku: input.sku,
        warehouseId: input.warehouseId
      },
      message: "Inventory adjustment would violate reserved stock invariants",
      statusCode: 409
    });
  }

  async confirmReservationsForOrder(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<InventoryReservationRecord[]> {
    return this.client.$transaction(async (transaction) => {
      const reservations = await transaction.inventoryReservation.findMany({
        orderBy: [{ sku: "asc" }, { warehouseId: "asc" }],
        where: {
          orderId: input.orderId,
          status: "PENDING"
        }
      });

      const confirmedReservations: InventoryReservationRecord[] = [];

      for (const reservation of reservations) {
        const updateCount = await transaction.$executeRaw`
          UPDATE inventory_items
          SET on_hand_qty = on_hand_qty - ${reservation.quantity},
              reserved_qty = reserved_qty - ${reservation.quantity},
              version = version + 1,
              updated_at = now()
          WHERE sku = ${reservation.sku}
            AND warehouse_id = ${reservation.warehouseId}::uuid
            AND on_hand_qty >= ${reservation.quantity}
            AND reserved_qty >= ${reservation.quantity}
        `;

        if (updateCount !== 1) {
          throw new AppError({
            code: "INVENTORY_CONFIRMATION_FAILED",
            details: {
              reservationId: reservation.id
            },
            message: "Inventory reservation could not be confirmed",
            statusCode: 409
          });
        }

        const confirmedReservation =
          await transaction.inventoryReservation.update({
            data: {
              status: "CONFIRMED",
              updatedAt: input.confirmedAt
            },
            where: {
              id: reservation.id
            }
          });

        await createOutboxEvent(transaction, {
          aggregateId: reservation.orderId,
          aggregateType: "inventory_reservation",
          eventType: "inventory.reservation.confirmed",
          payload: {
            orderId: reservation.orderId,
            quantity: reservation.quantity,
            reservationId: reservation.id,
            sku: reservation.sku,
            warehouseId: reservation.warehouseId
          }
        });

        confirmedReservations.push(mapReservation(confirmedReservation));
      }

      return confirmedReservations;
    });
  }

  async expirePendingReservations(input: {
    expiredAt: Date;
    limit: number;
  }): Promise<InventoryReservationRecord[]> {
    return this.client.$transaction(async (transaction) => {
      const reservations = await transaction.inventoryReservation.findMany({
        orderBy: {
          expiresAt: "asc"
        },
        take: input.limit,
        where: {
          expiresAt: {
            lte: input.expiredAt
          },
          status: "PENDING"
        }
      });

      const expiredReservations: InventoryReservationRecord[] = [];

      for (const reservation of reservations) {
        const expiredReservation = await releaseReservation({
          eventType: "inventory.reservation.expired",
          nextStatus: "EXPIRED",
          reservation,
          transaction,
          updatedAt: input.expiredAt
        });

        expiredReservations.push(expiredReservation);
      }

      return expiredReservations;
    });
  }

  async findItem(input: {
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord | null> {
    const item = await this.client.inventoryItem.findUnique({
      where: {
        inventory_items_sku_warehouse_id_key: {
          sku: input.sku,
          warehouseId: input.warehouseId
        }
      }
    });

    return item
      ? {
          availableQty: item.onHandQty - item.reservedQty,
          id: item.id,
          onHandQty: item.onHandQty,
          reservedQty: item.reservedQty,
          sku: item.sku,
          updatedAt: item.updatedAt,
          version: item.version,
          warehouseId: item.warehouseId
        }
      : null;
  }

  async listItems(
    filters: ListInventoryItemsFilters
  ): Promise<InventoryItemRecord[]> {
    const where: Prisma.InventoryItemWhereInput = {};

    if (filters.sku) {
      where.sku = filters.sku;
    }

    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    const items = await this.client.inventoryItem.findMany({
      orderBy: [{ sku: "asc" }, { warehouseId: "asc" }],
      take: filters.limit,
      where
    });

    return items.map((item) => ({
      availableQty: item.onHandQty - item.reservedQty,
      id: item.id,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
      sku: item.sku,
      updatedAt: item.updatedAt,
      version: item.version,
      warehouseId: item.warehouseId
    }));
  }

  async releaseReservationsForOrder(input: {
    orderId: string;
    releasedAt: Date;
  }): Promise<InventoryReservationRecord[]> {
    return this.client.$transaction(async (transaction) => {
      const reservations = await transaction.inventoryReservation.findMany({
        orderBy: [{ sku: "asc" }, { warehouseId: "asc" }],
        where: {
          orderId: input.orderId,
          status: "PENDING"
        }
      });

      const releasedReservations: InventoryReservationRecord[] = [];

      for (const reservation of reservations) {
        const releasedReservation = await releaseReservation({
          eventType: "inventory.reservation.released",
          nextStatus: "RELEASED",
          reservation,
          transaction,
          updatedAt: input.releasedAt
        });

        releasedReservations.push(releasedReservation);
      }

      return releasedReservations;
    });
  }

  async reserve(input: {
    expiresAt: Date;
    lines: Array<{
      quantity: number;
      sku: string;
    }>;
    orderId: string;
    reservedAt: Date;
  }): Promise<InventoryReservationResult> {
    for (
      let attemptIndex = 0;
      attemptIndex <= env.INVENTORY_RESERVATION_MAX_RETRIES;
      attemptIndex += 1
    ) {
      try {
        return await this.reserveOnce(input);
      } catch (error) {
        if (!isRetryableReservationError(error)) {
          throw normalizeReservationError(error);
        }

        if (attemptIndex === env.INVENTORY_RESERVATION_MAX_RETRIES) {
          throw inventoryContentionError();
        }

        await this.sleep(retryBackoffMs[attemptIndex] ?? 100);
      }
    }

    throw inventoryContentionError();
  }

  async upsertItem(input: {
    onHandQty: number;
    sku: string;
    warehouseId: string;
  }): Promise<InventoryItemRecord> {
    const existingItem = await this.findItem(input);

    if (existingItem && input.onHandQty < existingItem.reservedQty) {
      throw new AppError({
        code: "INVENTORY_ADJUSTMENT_INVALID",
        details: {
          requestedOnHandQty: input.onHandQty,
          reservedQty: existingItem.reservedQty,
          sku: input.sku,
          warehouseId: input.warehouseId
        },
        message:
          "Inventory on-hand quantity cannot be lower than reserved stock",
        statusCode: 409
      });
    }

    const item = await this.client.inventoryItem.upsert({
      create: {
        onHandQty: input.onHandQty,
        reservedQty: 0,
        sku: input.sku,
        warehouseId: input.warehouseId
      },
      update: {
        onHandQty: input.onHandQty,
        updatedAt: new Date(),
        version: {
          increment: 1
        }
      },
      where: {
        inventory_items_sku_warehouse_id_key: {
          sku: input.sku,
          warehouseId: input.warehouseId
        }
      }
    });

    return {
      availableQty: item.onHandQty - item.reservedQty,
      id: item.id,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
      sku: item.sku,
      updatedAt: item.updatedAt,
      version: item.version,
      warehouseId: item.warehouseId
    };
  }

  private async reserveOnce(input: {
    expiresAt: Date;
    lines: Array<{
      quantity: number;
      sku: string;
    }>;
    orderId: string;
    reservedAt: Date;
  }): Promise<InventoryReservationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const reservations: InventoryReservationRecord[] = [];

        for (const line of input.lines) {
          const reservedForLine = await reserveLine(transaction, {
            expiresAt: input.expiresAt,
            line,
            orderId: input.orderId,
            reservedAt: input.reservedAt
          });

          reservations.push(...reservedForLine);
        }

        return {
          expiresAt: input.expiresAt,
          reservations
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );
  }
}

const reserveLine = async (
  transaction: Prisma.TransactionClient,
  input: {
    expiresAt: Date;
    line: {
      quantity: number;
      sku: string;
    };
    orderId: string;
    reservedAt: Date;
  }
) => {
  const candidates = await transaction.$queryRaw<RawInventoryItem[]>`
    SELECT id,
           sku,
           warehouse_id,
           on_hand_qty,
           reserved_qty,
           version,
           updated_at,
           on_hand_qty - reserved_qty AS available_qty
    FROM inventory_items
    WHERE sku = ${input.line.sku}
      AND on_hand_qty - reserved_qty > 0
    ORDER BY on_hand_qty - reserved_qty DESC,
             warehouse_id ASC
  `;
  const totalAvailableQty = candidates.reduce(
    (total, candidate) => total + Number(candidate.available_qty),
    0
  );

  if (totalAvailableQty < input.line.quantity) {
    throw inventoryUnavailableError(input.line.sku, input.line.quantity);
  }

  let remainingQty = input.line.quantity;
  const reservations: InventoryReservationRecord[] = [];

  for (const candidate of candidates) {
    if (remainingQty === 0) {
      break;
    }

    const quantityToReserve = Math.min(
      remainingQty,
      Number(candidate.available_qty)
    );

    const updatedRows = await transaction.$queryRaw<RawInventoryItem[]>`
      UPDATE inventory_items
      SET reserved_qty = reserved_qty + ${quantityToReserve},
          version = version + 1,
          updated_at = now()
      WHERE sku = ${candidate.sku}
        AND warehouse_id = ${candidate.warehouse_id}::uuid
        AND on_hand_qty - reserved_qty >= ${quantityToReserve}
        AND version = ${candidate.version}
      RETURNING id,
                sku,
                warehouse_id,
                on_hand_qty,
                reserved_qty,
                version,
                updated_at,
                on_hand_qty - reserved_qty AS available_qty
    `;

    if (updatedRows.length !== 1) {
      throw inventoryContentionError();
    }

    const reservation = await transaction.inventoryReservation.create({
      data: {
        expiresAt: input.expiresAt,
        orderId: input.orderId,
        quantity: quantityToReserve,
        sku: candidate.sku,
        status: "PENDING",
        warehouseId: candidate.warehouse_id
      }
    });

    await createOutboxEvent(transaction, {
      aggregateId: input.orderId,
      aggregateType: "inventory_reservation",
      eventType: "inventory.reserved",
      payload: {
        expiresAt: input.expiresAt.toISOString(),
        orderId: input.orderId,
        quantity: quantityToReserve,
        reservationId: reservation.id,
        reservedAt: input.reservedAt.toISOString(),
        sku: candidate.sku,
        warehouseId: candidate.warehouse_id
      }
    });

    reservations.push(mapReservation(reservation));
    remainingQty -= quantityToReserve;
  }

  if (remainingQty !== 0) {
    throw inventoryContentionError();
  }

  return reservations;
};

const releaseReservation = async (input: {
  eventType: string;
  nextStatus: "EXPIRED" | "RELEASED";
  reservation: {
    id: string;
    orderId: string;
    quantity: number;
    sku: string;
    warehouseId: string;
  };
  transaction: Prisma.TransactionClient;
  updatedAt: Date;
}): Promise<InventoryReservationRecord> => {
  const updateCount = await input.transaction.$executeRaw`
    UPDATE inventory_items
    SET reserved_qty = reserved_qty - ${input.reservation.quantity},
        version = version + 1,
        updated_at = now()
    WHERE sku = ${input.reservation.sku}
      AND warehouse_id = ${input.reservation.warehouseId}::uuid
      AND reserved_qty >= ${input.reservation.quantity}
  `;

  if (updateCount !== 1) {
    throw new AppError({
      code: "INVENTORY_RELEASE_FAILED",
      details: {
        reservationId: input.reservation.id
      },
      message: "Inventory reservation could not be released",
      statusCode: 409
    });
  }

  const reservation = await input.transaction.inventoryReservation.update({
    data: {
      status: input.nextStatus,
      updatedAt: input.updatedAt
    },
    where: {
      id: input.reservation.id
    }
  });

  await createOutboxEvent(input.transaction, {
    aggregateId: input.reservation.orderId,
    aggregateType: "inventory_reservation",
    eventType: input.eventType,
    payload: {
      orderId: input.reservation.orderId,
      quantity: input.reservation.quantity,
      reservationId: input.reservation.id,
      sku: input.reservation.sku,
      status: input.nextStatus,
      warehouseId: input.reservation.warehouseId
    }
  });

  return mapReservation(reservation);
};

const createOutboxEvent = (
  client: PrismaClientLike,
  input: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: Prisma.InputJsonObject;
  }
) =>
  client.outboxEvent.create({
    data: {
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      eventType: input.eventType,
      payload: input.payload,
      status: "PENDING"
    }
  });

const mapRawInventoryItem = (row: RawInventoryItem): InventoryItemRecord => ({
  availableQty: Number(row.available_qty),
  id: row.id,
  onHandQty: Number(row.on_hand_qty),
  reservedQty: Number(row.reserved_qty),
  sku: row.sku,
  updatedAt: row.updated_at,
  version: Number(row.version),
  warehouseId: row.warehouse_id
});

const mapReservation = (reservation: {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  orderId: string;
  quantity: number;
  sku: string;
  status: string;
  updatedAt: Date;
  warehouseId: string;
}): InventoryReservationRecord => ({
  createdAt: reservation.createdAt,
  expiresAt: reservation.expiresAt,
  id: reservation.id,
  orderId: reservation.orderId,
  quantity: reservation.quantity,
  sku: reservation.sku,
  status: reservation.status as InventoryReservationRecord["status"],
  updatedAt: reservation.updatedAt,
  warehouseId: reservation.warehouseId
});

const inventoryContentionError = () =>
  new AppError({
    code: "INVENTORY_CONTENTION",
    message: "Inventory reservation encountered write contention",
    statusCode: 409
  });

const inventoryUnavailableError = (sku: string, requestedQty: number) =>
  new AppError({
    code: "INVENTORY_UNAVAILABLE",
    details: {
      requestedQty,
      sku
    },
    message: "Inventory is unavailable for the requested quantity",
    statusCode: 409
  });

const isRetryableReservationError = (error: unknown) => {
  if (error instanceof AppError && error.code === "INVENTORY_CONTENTION") {
    return true;
  }

  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
};

const normalizeReservationError = (error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    return new AppError({
      code: "RESERVATION_ORDER_NOT_FOUND",
      message: "Reservation order does not exist",
      statusCode: 400
    });
  }

  return error;
};

const delay = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
