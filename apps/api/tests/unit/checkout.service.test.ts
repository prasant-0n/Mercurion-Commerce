import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  Cart,
  CartRepository
} from "@/modules/cart/application/ports/cart.repository";
import type {
  CheckoutOrderRecord,
  CheckoutPaymentAttemptRecord,
  CheckoutRepository
} from "@/modules/checkout/application/ports/checkout.repository";
import type {
  CreateProviderPaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderPaymentStatus
} from "@/modules/checkout/application/ports/payment-provider";
import type {
  ProductSnapshot,
  ProductSnapshotProvider
} from "@/modules/checkout/application/ports/product-snapshot.provider";
import { CheckoutService } from "@/modules/checkout/application/services/checkout.service";
import type {
  InventoryItemRecord,
  InventoryRepository,
  InventoryReservationLineInput,
  InventoryReservationRecord
} from "@/modules/inventory/application/ports/inventory.repository";
import { InventoryService } from "@/modules/inventory/application/services/inventory.service";

const customerId = "00000000-0000-4000-8000-000000000001";
const orderId = "00000000-0000-4000-8000-000000000002";
const paymentAttemptId = "00000000-0000-4000-8000-000000000003";
const providerPaymentId = "pay_000000000004";
const idempotencyKey = "00000000-0000-4000-8000-000000000005";

describe("CheckoutService", () => {
  it("creates an awaiting-payment order after validating cart, prices, and inventory", async () => {
    const checkoutRepository = new FakeCheckoutRepository();
    const inventoryRepository = new FakeInventoryRepository();
    const service = buildCheckoutService({
      checkoutRepository,
      inventoryRepository
    });

    const result = await service.createCheckout(buildCheckoutInput());

    expect(result).toMatchObject({
      orderId,
      status: "AWAITING_PAYMENT"
    });
    expect(checkoutRepository.createdOrder?.totalAmount).toBe(2000);
    expect(inventoryRepository.reservedLines).toEqual([
      {
        quantity: 2,
        sku: "SKU-1"
      }
    ]);
    expect(checkoutRepository.awaitingPaymentOrderId).toBe(orderId);
  });

  it("releases reservations and fails the order when payment initiation fails", async () => {
    const checkoutRepository = new FakeCheckoutRepository();
    const inventoryRepository = new FakeInventoryRepository();
    const service = buildCheckoutService({
      checkoutRepository,
      inventoryRepository,
      paymentProvider: new FakePaymentProvider({
        createError: new Error("provider unavailable")
      })
    });

    await expect(service.createCheckout(buildCheckoutInput())).rejects.toThrow(
      "provider unavailable"
    );

    expect(inventoryRepository.releasedOrderId).toBe(orderId);
    expect(checkoutRepository.failedOrderId).toBe(orderId);
  });

  it("confirms inventory and order on a captured payment webhook", async () => {
    const checkoutRepository = new FakeCheckoutRepository();
    const inventoryRepository = new FakeInventoryRepository();
    const service = buildCheckoutService({
      checkoutRepository,
      inventoryRepository
    });

    const result = await service.handleRazorpayWebhook({
      body: {
        eventId: "evt_1",
        eventType: "payment.captured",
        providerPaymentId
      },
      eventId: undefined,
      rawBody: "{}",
      signature: "valid"
    });

    expect(result).toEqual({
      accepted: true,
      duplicate: false
    });
    expect(inventoryRepository.confirmedOrderId).toBe(orderId);
    expect(checkoutRepository.confirmedOrderId).toBe(orderId);
  });
});

const buildCheckoutService = (input: {
  checkoutRepository: FakeCheckoutRepository;
  inventoryRepository: FakeInventoryRepository;
  paymentProvider?: PaymentProvider;
}) =>
  new CheckoutService(
    input.checkoutRepository,
    new FakeCartRepository(),
    new FakeProductSnapshotProvider(),
    new InventoryService(input.inventoryRepository),
    input.paymentProvider ?? new FakePaymentProvider(),
    () => new Date("2026-05-06T10:00:00.000Z")
  );

const buildCheckoutInput = () => ({
  billingAddressId: "addr_billing",
  cartId: customerId,
  customerId,
  idempotencyKey,
  paymentMethod: {
    type: "UPI_INTENT" as const
  },
  shippingAddressId: "addr_shipping"
});

class FakeCartRepository implements CartRepository {
  getByCustomerId(): Promise<Cart | null> {
    return Promise.resolve({
      customerId,
      expiresAt: new Date("2026-06-06T10:00:00.000Z"),
      id: customerId,
      lines: [
        {
          addedAt: new Date("2026-05-06T09:00:00.000Z"),
          quantity: 2,
          sku: "SKU-1",
          updatedAt: new Date("2026-05-06T09:00:00.000Z")
        }
      ],
      schemaVersion: 1,
      updatedAt: new Date("2026-05-06T09:00:00.000Z"),
      version: 1
    });
  }

  save(cart: Cart): Promise<Cart> {
    return Promise.resolve(cart);
  }
}

class FakeProductSnapshotProvider implements ProductSnapshotProvider {
  findBySku(sku: string): Promise<ProductSnapshot | null> {
    return Promise.resolve({
      image: null,
      isActive: true,
      name: "Test Product",
      price: {
        amount: 1000,
        currency: "INR"
      },
      productId: "prod_1",
      sku,
      slug: "test-product"
    });
  }
}

class FakeInventoryRepository implements InventoryRepository {
  confirmedOrderId: string | undefined;
  releasedOrderId: string | undefined;
  reservedLines: InventoryReservationLineInput[] = [];

  adjustOnHand(): Promise<InventoryItemRecord> {
    return Promise.resolve(buildInventoryItem());
  }

  confirmReservationsForOrder(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<InventoryReservationRecord[]> {
    this.confirmedOrderId = input.orderId;
    return Promise.resolve([buildReservation(input.orderId)]);
  }

  expirePendingReservations(): Promise<InventoryReservationRecord[]> {
    return Promise.resolve([]);
  }

  findItem(): Promise<InventoryItemRecord | null> {
    return Promise.resolve(buildInventoryItem());
  }

  listItems(): Promise<InventoryItemRecord[]> {
    return Promise.resolve([buildInventoryItem()]);
  }

  releaseReservationsForOrder(input: {
    orderId: string;
    releasedAt: Date;
  }): Promise<InventoryReservationRecord[]> {
    this.releasedOrderId = input.orderId;
    return Promise.resolve([buildReservation(input.orderId)]);
  }

  reserve(input: {
    expiresAt: Date;
    lines: InventoryReservationLineInput[];
    orderId: string;
    reservedAt: Date;
  }) {
    this.reservedLines = input.lines;
    return Promise.resolve({
      expiresAt: input.expiresAt,
      reservations: [buildReservation(input.orderId)]
    });
  }

  upsertItem(): Promise<InventoryItemRecord> {
    return Promise.resolve(buildInventoryItem());
  }
}

class FakeCheckoutRepository implements CheckoutRepository {
  awaitingPaymentOrderId: string | undefined;
  confirmedOrderId: string | undefined;
  createdOrder:
    | {
        totalAmount: number;
      }
    | undefined;
  failedOrderId: string | undefined;

  createPaymentAttempt(): Promise<CheckoutPaymentAttemptRecord> {
    return Promise.resolve(buildPaymentAttempt());
  }

  createPendingOrder(input: {
    currency: string;
    customerId: string;
    idempotencyKey: string;
    items: Array<{
      lineTotalAmount: number;
      productSnapshot: Prisma.InputJsonObject;
      quantity: number;
      sku: string;
      unitPriceAmount: number;
    }>;
    subtotalAmount: number;
    totalAmount: number;
  }): Promise<CheckoutOrderRecord> {
    this.createdOrder = {
      totalAmount: input.totalAmount
    };
    return Promise.resolve(buildOrder());
  }

  failOrder(input: { failedAt: Date; orderId: string }): Promise<void> {
    this.failedOrderId = input.orderId;
    return Promise.resolve();
  }

  findOrderById(): Promise<CheckoutOrderRecord | null> {
    return Promise.resolve(buildOrder());
  }

  findPaymentAttemptByProviderPaymentId(): Promise<CheckoutPaymentAttemptRecord | null> {
    return Promise.resolve(buildPaymentAttempt());
  }

  listStalePendingPaymentAttempts(): Promise<CheckoutPaymentAttemptRecord[]> {
    return Promise.resolve([]);
  }

  markOrderAwaitingPayment(input: {
    orderId: string;
    updatedAt: Date;
  }): Promise<void> {
    this.awaitingPaymentOrderId = input.orderId;
    return Promise.resolve();
  }

  markOrderCancelled(): Promise<void> {
    return Promise.resolve();
  }

  markOrderConfirmed(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<void> {
    this.confirmedOrderId = input.orderId;
    return Promise.resolve();
  }

  recordPaymentWebhookEvent(): Promise<"duplicate" | "recorded"> {
    return Promise.resolve("recorded");
  }

  updatePaymentAttemptStatus(): Promise<CheckoutPaymentAttemptRecord | null> {
    return Promise.resolve(buildPaymentAttempt());
  }
}

class FakePaymentProvider implements PaymentProvider {
  constructor(private readonly options: { createError?: Error } = {}) {}

  createPayment(
    input: CreateProviderPaymentInput
  ): Promise<ProviderPaymentResult> {
    if (this.options.createError) {
      return Promise.reject(this.options.createError);
    }

    return Promise.resolve({
      provider: "razorpay",
      providerPaymentId,
      rawResponse: {
        orderId: input.orderId
      },
      redirectUrl: "https://checkout.example.test/payments/pay_1"
    });
  }

  lookupPaymentStatus(): Promise<ProviderPaymentStatus> {
    return Promise.resolve("PENDING");
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}

const buildOrder = (): CheckoutOrderRecord => ({
  createdAt: new Date("2026-05-06T10:00:00.000Z"),
  currency: "INR",
  customerId,
  id: orderId,
  items: [
    {
      lineTotalAmount: 2000,
      name: "Test Product",
      quantity: 2,
      sku: "SKU-1",
      unitPriceAmount: 1000
    }
  ],
  orderNumber: "1",
  paymentStatus: "PENDING",
  status: "PENDING",
  totalAmount: 2000,
  updatedAt: new Date("2026-05-06T10:00:00.000Z")
});

const buildPaymentAttempt = (): CheckoutPaymentAttemptRecord => ({
  amount: 2000,
  createdAt: new Date("2026-05-06T10:00:00.000Z"),
  currency: "INR",
  id: paymentAttemptId,
  orderId,
  provider: "razorpay",
  providerPaymentId,
  status: "PENDING"
});

const buildInventoryItem = (): InventoryItemRecord => ({
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
  inputOrderId: string
): InventoryReservationRecord => ({
  createdAt: new Date("2026-05-06T10:00:00.000Z"),
  expiresAt: new Date("2026-05-06T10:15:00.000Z"),
  id: "00000000-0000-4000-8000-000000000030",
  orderId: inputOrderId,
  quantity: 2,
  sku: "SKU-1",
  status: "PENDING",
  updatedAt: new Date("2026-05-06T10:00:00.000Z"),
  warehouseId: "00000000-0000-4000-8000-000000000020"
});
