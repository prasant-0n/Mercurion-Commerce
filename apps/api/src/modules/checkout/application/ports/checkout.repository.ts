import type { Prisma } from "@prisma/client";

export type CheckoutOrderItemInput = {
  lineTotalAmount: number;
  productSnapshot: Prisma.InputJsonObject;
  quantity: number;
  sku: string;
  unitPriceAmount: number;
};

export type CheckoutOrderRecord = {
  createdAt: Date;
  currency: string;
  customerId: string;
  id: string;
  items: Array<{
    lineTotalAmount: number;
    name: string;
    quantity: number;
    sku: string;
    unitPriceAmount: number;
  }>;
  orderNumber: string;
  paymentStatus: string | null;
  status: string;
  totalAmount: number;
  updatedAt: Date;
};

export type CheckoutPaymentAttemptRecord = {
  amount: number;
  createdAt: Date;
  currency: string;
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  status: string;
};

export interface CheckoutRepository {
  createPaymentAttempt(input: {
    amount: number;
    currency: string;
    id: string;
    idempotencyKey: string;
    orderId: string;
    provider: string;
    providerPaymentId: string;
    providerResponse: Prisma.InputJsonObject;
  }): Promise<CheckoutPaymentAttemptRecord>;
  createPendingOrder(input: {
    currency: string;
    customerId: string;
    idempotencyKey: string;
    items: CheckoutOrderItemInput[];
    subtotalAmount: number;
    totalAmount: number;
  }): Promise<CheckoutOrderRecord>;
  failOrder(input: { failedAt: Date; orderId: string }): Promise<void>;
  findOrderById(orderId: string): Promise<CheckoutOrderRecord | null>;
  findPaymentAttemptByProviderPaymentId(input: {
    provider: string;
    providerPaymentId: string;
  }): Promise<CheckoutPaymentAttemptRecord | null>;
  listStalePendingPaymentAttempts(input: {
    limit: number;
    olderThan: Date;
  }): Promise<CheckoutPaymentAttemptRecord[]>;
  markOrderAwaitingPayment(input: {
    orderId: string;
    updatedAt: Date;
  }): Promise<void>;
  markOrderCancelled(input: {
    cancelledAt: Date;
    orderId: string;
  }): Promise<void>;
  markOrderConfirmed(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<void>;
  recordPaymentWebhookEvent(input: {
    eventId: string;
    eventType: string;
    payload: Prisma.InputJsonObject;
    provider: string;
    providerPaymentId: string;
  }): Promise<"duplicate" | "recorded">;
  updatePaymentAttemptStatus(input: {
    providerPaymentId: string;
    providerResponse?: Prisma.InputJsonObject | undefined;
    status: "AUTHORIZED" | "CANCELLED" | "CAPTURED" | "FAILED" | "PENDING";
    updatedAt: Date;
  }): Promise<CheckoutPaymentAttemptRecord | null>;
}
