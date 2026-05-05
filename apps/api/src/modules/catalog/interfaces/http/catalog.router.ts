import { Router } from "express";

import {
  authenticateRequest,
  requireAuthentication
} from "@/modules/auth/interfaces/http/authentication.middleware";
import { requirePermissions } from "@/modules/auth/interfaces/http/authorization.middleware";
import {
  CatalogService,
  mapCatalogProductResponse,
  mapCatalogProductsResponse
} from "@/modules/catalog/application/services/catalog.service";
import { MongoCatalogRepository } from "@/modules/catalog/infrastructure/repositories/mongo-catalog.repository";
import {
  catalogProductBodySchema,
  catalogProductIdParamsSchema,
  catalogProductListQuerySchema
} from "@/modules/catalog/interfaces/http/catalog.schemas";
import { asyncHandler } from "@/shared/http/async-handler";

const createDefaultCatalogService = () =>
  new CatalogService(new MongoCatalogRepository());

export const createCatalogRouter = (
  catalogService: CatalogService = createDefaultCatalogService()
) => {
  const router = Router();

  router.use(asyncHandler(authenticateRequest));
  router.use(requireAuthentication);
  router.use(requirePermissions("catalog:write"));

  router.post(
    "/products",
    asyncHandler(async (request, response) => {
      const input = catalogProductBodySchema.parse(request.body);
      const product = await catalogService.createProduct(input);

      response.status(201).json(mapCatalogProductResponse(product));
    })
  );

  router.get(
    "/products",
    asyncHandler(async (request, response) => {
      const filters = catalogProductListQuerySchema.parse(request.query);
      const products = await catalogService.listProducts(filters);

      response.status(200).json(mapCatalogProductsResponse(products));
    })
  );

  router.get(
    "/products/:productId",
    asyncHandler(async (request, response) => {
      const params = catalogProductIdParamsSchema.parse(request.params);
      const product = await catalogService.getProduct(params.productId);

      response.status(200).json(mapCatalogProductResponse(product));
    })
  );

  router.put(
    "/products/:productId",
    asyncHandler(async (request, response) => {
      const params = catalogProductIdParamsSchema.parse(request.params);
      const input = catalogProductBodySchema.parse(request.body);
      const product = await catalogService.updateProduct({
        ...input,
        productId: params.productId
      });

      response.status(200).json(mapCatalogProductResponse(product));
    })
  );

  return router;
};
