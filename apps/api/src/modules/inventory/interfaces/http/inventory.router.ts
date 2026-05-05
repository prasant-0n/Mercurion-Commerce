import { Router } from "express";

import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import { requirePermissions } from "@/modules/auth/interfaces/http/authorization.middleware";
import {
  InventoryService,
  mapInventoryItemResponse,
  mapInventoryItemsResponse,
  mapInventoryReservationsResponse
} from "@/modules/inventory/application/services/inventory.service";
import { PrismaInventoryRepository } from "@/modules/inventory/infrastructure/repositories/prisma-inventory.repository";
import {
  inventoryAdjustmentBodySchema,
  inventoryItemBodySchema,
  inventoryItemListQuerySchema,
  inventoryItemParamsSchema,
  inventoryReservationBodySchema
} from "@/modules/inventory/interfaces/http/inventory.schemas";
import { asyncHandler } from "@/shared/http/async-handler";

const createDefaultInventoryService = () =>
  new InventoryService(new PrismaInventoryRepository());

export const createInventoryRouter = (
  inventoryService: InventoryService = createDefaultInventoryService()
) => {
  const router = Router();

  router.use(asyncHandler(authenticateRequest));
  router.use(requireAuthentication);

  router.get(
    "/items",
    requirePermissions("inventory:adjust"),
    asyncHandler(async (request, response) => {
      const filters = inventoryItemListQuerySchema.parse(request.query);
      const items = await inventoryService.listItems(filters);

      response.status(200).json(mapInventoryItemsResponse(items));
    })
  );

  router.post(
    "/items",
    requirePermissions("inventory:adjust"),
    asyncHandler(async (request, response) => {
      const input = inventoryItemBodySchema.parse(request.body);
      const item = await inventoryService.upsertItem(input);

      response.status(200).json({
        item: mapInventoryItemResponse(item)
      });
    })
  );

  router.get(
    "/items/:sku/:warehouseId",
    requirePermissions("inventory:adjust"),
    asyncHandler(async (request, response) => {
      const params = inventoryItemParamsSchema.parse(request.params);
      const item = await inventoryService.getItem(params);

      response.status(200).json({
        item: mapInventoryItemResponse(item)
      });
    })
  );

  router.post(
    "/items/:sku/:warehouseId/adjustments",
    requirePermissions("inventory:adjust"),
    asyncHandler(async (request, response) => {
      const params = inventoryItemParamsSchema.parse(request.params);
      const input = inventoryAdjustmentBodySchema.parse(request.body);
      const item = await inventoryService.adjustOnHand({
        quantityDelta: input.quantityDelta,
        sku: params.sku,
        warehouseId: params.warehouseId
      });

      response.status(200).json({
        item: mapInventoryItemResponse(item)
      });
    })
  );

  router.post(
    "/reservations",
    requirePermissions("inventory:adjust"),
    asyncHandler(async (request, response) => {
      const input = inventoryReservationBodySchema.parse(request.body);
      const result = await inventoryService.reserve(input);

      response.status(201).json({
        expiresAt: result.expiresAt.toISOString(),
        ...mapInventoryReservationsResponse(result.reservations)
      });
    })
  );

  router.get(
    "/metrics",
    requirePermissions("inventory:adjust"),
    (request, response) => {
      void request;
      response.status(200).json({
        metrics: inventoryService.getMetrics()
      });
    }
  );

  return router;
};
