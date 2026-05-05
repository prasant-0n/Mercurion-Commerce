import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { env } from "@/config/env";
import type { CartRepository } from "@/modules/cart/application/ports/cart.repository";
import { RedisCartRepository } from "@/modules/cart/infrastructure/repositories/redis-cart.repository";
import type { CheckoutRepository } from "@/modules/checkout/application/ports/checkout.repository";
import type {
  PaymentMethodInput,
  PaymentProvider,
  ProviderPaymentStatus
} from "@/modules/checkout/application/ports/payment-provider";
import type {
  ProductSnapshot,
  ProductSnapshotProvider
} from "@/modules/checkout/application/ports/product-snapshot.provider";
import { MongoProductSnapshotProvider } from "@/modules/checkout/infrastructure/catalog/mongo-product-snapshot.provider";
import { DevPaymentProvider } from "@/modules/checkout/infrastructure/payments/dev-payment-provider";
import { PrismaCheckoutRepository } from "@/modules/checkout/infrastructure/repositories/prisma-checkout.repository";
import { InventoryService } from "@/modules/inventory/application/services/inventory.service";
import { PrismaInventoryRepository } from "@/modules/inventory/infrastructure/repositories/prisma-inventory.repository";
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError
} from "@/shared/errors/app-error";

type CreateCheckoutInput = {
  billingAddressId: string;
  cartId: string;
  customerId: string;
  idempotencyKey: string;
  paymentMethod: PaymentMethodInput;
  shippingAddressId: string;
};

type CheckoutResult = {
  expiresAt: Date;
  orderId: string;
  payment: {
    attemptId: string;
    provider: string;
    redirectUrl: string;
  };
  status: "AWAITING_PAYMENT";
};

type RazorpayWebhookInput = {
  body: unknown;
  eventId: string | undefined;
  rawBody: string;
  signature: string | undefined;
};

type OrderViewer = {
  canReadAny: boolean;
  userId: string;
};

export class CheckoutService {
  constructor(
    private readonly checkoutRepository: CheckoutRepository = new PrismaCheckoutRepository(),
    private readonly cartRepository: CartRepository = new RedisCartRepository(),
    private readonly productSnapshotProvider: ProductSnapshotProvider = new MongoProductSnapshotProvider(),
    private readonly inventoryService: InventoryService = new InventoryService(
      new PrismaInventoryRepository()
    ),
    private readonly paymentProvider: PaymentProvider = new DevPaymentProvider(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const cart = await this.cartRepository.getByCustomerId(input.customerId);

    if (!cart || cart.id !== input.cartId || cart.lines.length === 0) {
      throw cartInvalidError(
        "Cart is empty or does not belong to the customer"
      );
    }

    const snapshots = await this.loadProductSnapshots(
      cart.lines.map((line) => line.sku)
    );
    const orderTotals = buildOrderTotals(
      cart.lines.map((line) => ({
        product: requireProductSnapshot(snapshots, line.sku),
        quantity: line.quantity,
        sku: line.sku
      }))
    );
    const order = await this.checkoutRepository.createPendingOrder({
      currency: orderTotals.currency,
      customerId: input.customerId,
      idempotencyKey: input.idempotencyKey,
      items: orderTotals.items,
      subtotalAmount: orderTotals.subtotalAmount,
      totalAmount: orderTotals.totalAmount
    });

    let reservationCreated = false;

    try {
      const reservation = await this.inventoryService.reserve({
        lines: cart.lines.map((line) => ({
          quantity: line.quantity,
          sku: line.sku
        })),
        orderId: order.id
      });
      reservationCreated = true;

      const paymentAttemptId = randomUUID();
      const providerPayment = await this.paymentProvider.createPayment({
        amount: orderTotals.totalAmount,
        currency: orderTotals.currency,
        customerId: input.customerId,
        idempotencyKey: input.idempotencyKey,
        orderId: order.id,
        paymentAttemptId,
        paymentMethod: input.paymentMethod
      });
      const paymentAttempt = await this.checkoutRepository.createPaymentAttempt(
        {
          amount: orderTotals.totalAmount,
          currency: orderTotals.currency,
          id: paymentAttemptId,
          idempotencyKey: input.idempotencyKey,
          orderId: order.id,
          provider: providerPayment.provider,
          providerPaymentId: providerPayment.providerPaymentId,
          providerResponse: toJsonObject(providerPayment.rawResponse)
        }
      );

      await this.checkoutRepository.markOrderAwaitingPayment({
        orderId: order.id,
        updatedAt: this.now()
      });

      return {
        expiresAt: reservation.expiresAt,
        orderId: order.id,
        payment: {
          attemptId: paymentAttempt.id,
          provider: paymentAttempt.provider,
          redirectUrl: providerPayment.redirectUrl
        },
        status: "AWAITING_PAYMENT"
      };
    } catch (error) {
      if (reservationCreated) {
        await this.inventoryService.releaseReservationsForOrder(order.id);
        await this.checkoutRepository.failOrder({
          failedAt: this.now(),
          orderId: order.id
        });
      } else {
        await this.checkoutRepository.markOrderCancelled({
          cancelledAt: this.now(),
          orderId: order.id
        });
      }

      throw error;
    }
  }

  async getOrder(orderId: string, viewer: OrderViewer) {
    const order = await this.checkoutRepository.findOrderById(orderId);

    if (!order) {
      throw new NotFoundError("Order not found", {
        orderId
      });
    }

    if (!viewer.canReadAny && order.customerId !== viewer.userId) {
      throw new ForbiddenError("You do not have permission to read this order");
    }

    return order;
  }

  async handleRazorpayWebhook(input: RazorpayWebhookInput) {
    if (
      !this.paymentProvider.verifyWebhookSignature({
        rawBody: input.rawBody,
        signature: input.signature
      })
    ) {
      throw new UnauthorizedError("Payment webhook signature is invalid");
    }

    const webhook = extractRazorpayWebhook(input);
    const recordStatus =
      await this.checkoutRepository.recordPaymentWebhookEvent({
        eventId: webhook.eventId,
        eventType: webhook.eventType,
        payload: toJsonObject(input.body),
        provider: env.PAYMENT_PROVIDER,
        providerPaymentId: webhook.providerPaymentId
      });

    if (recordStatus === "duplicate") {
      return {
        accepted: true,
        duplicate: true
      };
    }

    await this.applyProviderPaymentStatus({
      providerPaymentId: webhook.providerPaymentId,
      providerResponse: toJsonObject(input.body),
      status: mapWebhookEventToPaymentStatus(webhook.eventType)
    });

    return {
      accepted: true,
      duplicate: false
    };
  }

  async reconcileStalePayments(limit = env.PAYMENT_RECONCILIATION_BATCH_SIZE) {
    const olderThan = new Date(
      this.now().getTime() - env.PAYMENT_RECONCILIATION_STALE_MS
    );
    const attempts =
      await this.checkoutRepository.listStalePendingPaymentAttempts({
        limit,
        olderThan
      });
    let reconciledCount = 0;

    for (const attempt of attempts) {
      if (!attempt.providerPaymentId) {
        continue;
      }

      const providerStatus = await this.paymentProvider.lookupPaymentStatus(
        attempt.providerPaymentId
      );
      const staleBeyondPaymentTimeout =
        this.now().getTime() - attempt.createdAt.getTime() >=
        env.CHECKOUT_PAYMENT_TIMEOUT_MS;

      if (providerStatus === "PENDING" && !staleBeyondPaymentTimeout) {
        continue;
      }

      await this.applyProviderPaymentStatus({
        providerPaymentId: attempt.providerPaymentId,
        providerResponse: {
          reconciledAt: this.now().toISOString(),
          source: "payment-reconciliation-worker"
        },
        status: providerStatus === "PENDING" ? "FAILED" : providerStatus
      });
      reconciledCount += 1;
    }

    return {
      checkedCount: attempts.length,
      reconciledCount
    };
  }

  private async applyProviderPaymentStatus(input: {
    providerPaymentId: string;
    providerResponse: Prisma.InputJsonObject;
    status: ProviderPaymentStatus;
  }) {
    if (input.status === "PENDING") {
      return;
    }

    const paymentAttempt =
      await this.checkoutRepository.updatePaymentAttemptStatus({
        providerPaymentId: input.providerPaymentId,
        providerResponse: input.providerResponse,
        status: input.status,
        updatedAt: this.now()
      });

    if (!paymentAttempt) {
      throw new BadRequestError("Payment attempt was not found", {
        providerPaymentId: input.providerPaymentId
      });
    }

    if (input.status === "CAPTURED") {
      await this.inventoryService.confirmReservationsForOrder(
        paymentAttempt.orderId
      );
      await this.checkoutRepository.markOrderConfirmed({
        confirmedAt: this.now(),
        orderId: paymentAttempt.orderId
      });
      return;
    }

    if (input.status === "FAILED" || input.status === "CANCELLED") {
      await this.inventoryService.releaseReservationsForOrder(
        paymentAttempt.orderId
      );
      await this.checkoutRepository.failOrder({
        failedAt: this.now(),
        orderId: paymentAttempt.orderId
      });
    }
  }

  private async loadProductSnapshots(skus: string[]) {
    const snapshots = new Map<string, ProductSnapshot>();

    for (const sku of skus) {
      const product = await this.productSnapshotProvider.findBySku(sku);

      if (!product || !product.isActive) {
        throw cartInvalidError("Cart contains an unavailable SKU", {
          sku
        });
      }

      snapshots.set(sku, product);
    }

    return snapshots;
  }
}

const buildOrderTotals = (
  lines: Array<{
    product: ProductSnapshot;
    quantity: number;
    sku: string;
  }>
) => {
  const firstCurrency = lines[0]?.product.price.currency;

  if (!firstCurrency) {
    throw cartInvalidError("Cart is empty");
  }

  const items = lines.map((line) => {
    if (line.product.price.currency !== firstCurrency) {
      throw cartInvalidError("Cart contains mixed currencies", {
        expectedCurrency: firstCurrency,
        sku: line.sku
      });
    }

    return {
      lineTotalAmount: line.product.price.amount * line.quantity,
      productSnapshot: buildProductSnapshotJson(line.product),
      quantity: line.quantity,
      sku: line.sku,
      unitPriceAmount: line.product.price.amount
    };
  });
  const subtotalAmount = items.reduce(
    (total, item) => total + item.lineTotalAmount,
    0
  );

  return {
    currency: firstCurrency,
    items,
    subtotalAmount,
    totalAmount: subtotalAmount
  };
};

const requireProductSnapshot = (
  snapshots: Map<string, ProductSnapshot>,
  sku: string
) => {
  const snapshot = snapshots.get(sku);

  if (!snapshot) {
    throw cartInvalidError("Cart contains an unavailable SKU", {
      sku
    });
  }

  return snapshot;
};

const buildProductSnapshotJson = (
  product: ProductSnapshot
): Prisma.InputJsonObject => ({
  image: product.image,
  name: product.name,
  price: product.price,
  productId: product.productId,
  sku: product.sku,
  slug: product.slug
});

const extractRazorpayWebhook = (input: RazorpayWebhookInput) => {
  const payload =
    input.body && typeof input.body === "object"
      ? (input.body as Record<string, unknown>)
      : {};
  const eventType = readString(payload.eventType) ?? readString(payload.event);
  const providerPaymentId =
    readString(payload.providerPaymentId) ??
    readNestedString(payload, ["payload", "payment", "entity", "id"]);
  const eventId =
    input.eventId ??
    readString(payload.eventId) ??
    readString(payload.id) ??
    `${eventType}:${providerPaymentId}`;

  if (!eventType || !providerPaymentId || !eventId) {
    throw new BadRequestError("Payment webhook payload is invalid");
  }

  return {
    eventId,
    eventType,
    providerPaymentId
  };
};

const mapWebhookEventToPaymentStatus = (
  eventType: string
): ProviderPaymentStatus => {
  if (eventType === "payment.captured") {
    return "CAPTURED";
  }

  if (eventType === "payment.authorized") {
    return "AUTHORIZED";
  }

  if (eventType === "payment.failed") {
    return "FAILED";
  }

  return "PENDING";
};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNestedString = (
  record: Record<string, unknown>,
  path: string[]
): string | undefined => {
  let cursor: unknown = record;

  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return readString(cursor);
};

const toJsonObject = (value: unknown): Prisma.InputJsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
};

const cartInvalidError = (message: string, details?: Record<string, unknown>) =>
  new AppError({
    code: "CART_INVALID",
    details,
    message,
    statusCode: 400
  });

export const mapCheckoutResponse = (result: CheckoutResult) => ({
  expiresAt: result.expiresAt.toISOString(),
  orderId: result.orderId,
  payment: result.payment,
  status: result.status
});

export const mapOrderResponse = (order: {
  createdAt: Date;
  currency: string;
  id: string;
  items: Array<{
    name: string;
    quantity: number;
    sku: string;
    unitPriceAmount: number;
  }>;
  paymentStatus: string | null;
  status: string;
  totalAmount: number;
}) => ({
  createdAt: order.createdAt.toISOString(),
  currency: order.currency,
  id: order.id,
  items: order.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    sku: item.sku,
    unitPriceAmount: item.unitPriceAmount
  })),
  paymentStatus: order.paymentStatus,
  status: order.status,
  totalAmount: order.totalAmount
});
