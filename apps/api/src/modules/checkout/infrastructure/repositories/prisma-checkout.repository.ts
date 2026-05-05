import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  CheckoutOrderRecord,
  CheckoutPaymentAttemptRecord,
  CheckoutRepository
} from "@/modules/checkout/application/ports/checkout.repository";
import { AppError } from "@/shared/errors/app-error";
import { prisma } from "@/shared/infrastructure/prisma/prisma-client";

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export class PrismaCheckoutRepository implements CheckoutRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createPaymentAttempt(input: {
    amount: number;
    currency: string;
    id: string;
    idempotencyKey: string;
    orderId: string;
    provider: string;
    providerPaymentId: string;
    providerResponse: Prisma.InputJsonObject;
  }): Promise<CheckoutPaymentAttemptRecord> {
    const paymentAttempt = await this.client.$transaction(
      async (transaction) => {
        const createdPaymentAttempt = await transaction.paymentAttempt.create({
          data: {
            amount: BigInt(input.amount),
            currency: input.currency,
            id: input.id,
            idempotencyKey: input.idempotencyKey,
            orderId: input.orderId,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId,
            providerResponse: input.providerResponse,
            status: "PENDING"
          }
        });

        await createOutboxEvent(transaction, {
          aggregateId: input.orderId,
          aggregateType: "payment_attempt",
          eventType: "payment.attempted",
          payload: {
            amount: input.amount,
            currency: input.currency,
            orderId: input.orderId,
            paymentAttemptId: input.id,
            provider: input.provider,
            providerPaymentId: input.providerPaymentId
          }
        });

        return createdPaymentAttempt;
      }
    );

    return mapPaymentAttempt(paymentAttempt);
  }

  async createPendingOrder(input: {
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
    try {
      const order = await this.client.$transaction(async (transaction) => {
        const createdOrder = await transaction.order.create({
          data: {
            currency: input.currency,
            customerId: input.customerId,
            discountAmount: 0,
            idempotencyKey: input.idempotencyKey,
            items: {
              create: input.items.map((item) => ({
                lineTotalAmount: BigInt(item.lineTotalAmount),
                productSnapshot: item.productSnapshot,
                quantity: item.quantity,
                sku: item.sku,
                unitPriceAmount: BigInt(item.unitPriceAmount)
              }))
            },
            shippingAmount: 0,
            status: "PENDING",
            subtotalAmount: BigInt(input.subtotalAmount),
            taxAmount: 0,
            totalAmount: BigInt(input.totalAmount)
          },
          include: orderInclude
        });

        await createOutboxEvent(transaction, {
          aggregateId: createdOrder.id,
          aggregateType: "order",
          eventType: "order.created",
          payload: {
            currency: input.currency,
            customerId: input.customerId,
            orderId: createdOrder.id,
            status: createdOrder.status,
            totalAmount: input.totalAmount
          }
        });

        return createdOrder;
      });

      return mapOrder(order);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError({
          code: "CHECKOUT_IDEMPOTENCY_CONFLICT",
          message: "Checkout idempotency key has already created an order",
          statusCode: 409
        });
      }

      throw error;
    }
  }

  async failOrder(input: { failedAt: Date; orderId: string }): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.order.updateMany({
        data: {
          status: "PAYMENT_FAILED",
          updatedAt: input.failedAt
        },
        where: {
          id: input.orderId,
          status: {
            in: ["PENDING", "AWAITING_PAYMENT"]
          }
        }
      });

      await createOutboxEvent(transaction, {
        aggregateId: input.orderId,
        aggregateType: "order",
        eventType: "order.failed",
        payload: {
          failedAt: input.failedAt.toISOString(),
          orderId: input.orderId,
          status: "PAYMENT_FAILED"
        }
      });
    });
  }

  async findOrderById(orderId: string): Promise<CheckoutOrderRecord | null> {
    const order = await this.client.order.findUnique({
      include: orderInclude,
      where: {
        id: orderId
      }
    });

    return order ? mapOrder(order) : null;
  }

  async findPaymentAttemptByProviderPaymentId(input: {
    provider: string;
    providerPaymentId: string;
  }): Promise<CheckoutPaymentAttemptRecord | null> {
    const paymentAttempt = await this.client.paymentAttempt.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId
        }
      }
    });

    return paymentAttempt ? mapPaymentAttempt(paymentAttempt) : null;
  }

  async listStalePendingPaymentAttempts(input: {
    limit: number;
    olderThan: Date;
  }): Promise<CheckoutPaymentAttemptRecord[]> {
    const paymentAttempts = await this.client.paymentAttempt.findMany({
      orderBy: {
        createdAt: "asc"
      },
      take: input.limit,
      where: {
        createdAt: {
          lte: input.olderThan
        },
        status: {
          in: ["AUTHORIZED", "PENDING"]
        }
      }
    });

    return paymentAttempts.map(mapPaymentAttempt);
  }

  async markOrderAwaitingPayment(input: {
    orderId: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.client.order.updateMany({
      data: {
        status: "AWAITING_PAYMENT",
        updatedAt: input.updatedAt
      },
      where: {
        id: input.orderId,
        status: "PENDING"
      }
    });
  }

  async markOrderCancelled(input: {
    cancelledAt: Date;
    orderId: string;
  }): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.order.updateMany({
        data: {
          status: "CANCELLED",
          updatedAt: input.cancelledAt
        },
        where: {
          id: input.orderId,
          status: "PENDING"
        }
      });

      await createOutboxEvent(transaction, {
        aggregateId: input.orderId,
        aggregateType: "order",
        eventType: "order.cancelled",
        payload: {
          cancelledAt: input.cancelledAt.toISOString(),
          orderId: input.orderId
        }
      });
    });
  }

  async markOrderConfirmed(input: {
    confirmedAt: Date;
    orderId: string;
  }): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      await transaction.order.updateMany({
        data: {
          status: "CONFIRMED",
          updatedAt: input.confirmedAt
        },
        where: {
          id: input.orderId,
          status: {
            in: ["AWAITING_PAYMENT", "PENDING"]
          }
        }
      });

      await createOutboxEvent(transaction, {
        aggregateId: input.orderId,
        aggregateType: "order",
        eventType: "order.confirmed",
        payload: {
          confirmedAt: input.confirmedAt.toISOString(),
          orderId: input.orderId
        }
      });
    });
  }

  async recordPaymentWebhookEvent(input: {
    eventId: string;
    eventType: string;
    payload: Prisma.InputJsonObject;
    provider: string;
    providerPaymentId: string;
  }): Promise<"duplicate" | "recorded"> {
    try {
      await this.client.paymentWebhookEvent.create({
        data: {
          eventId: input.eventId,
          eventType: input.eventType,
          payload: input.payload,
          provider: input.provider,
          providerPaymentId: input.providerPaymentId
        }
      });

      return "recorded";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "duplicate";
      }

      throw error;
    }
  }

  async updatePaymentAttemptStatus(input: {
    providerPaymentId: string;
    providerResponse?: Prisma.InputJsonObject | undefined;
    status: "AUTHORIZED" | "CANCELLED" | "CAPTURED" | "FAILED" | "PENDING";
    updatedAt: Date;
  }): Promise<CheckoutPaymentAttemptRecord | null> {
    const paymentAttempt = await this.client.paymentAttempt.findFirst({
      where: {
        providerPaymentId: input.providerPaymentId
      }
    });

    if (!paymentAttempt) {
      return null;
    }

    const updateData: Prisma.PaymentAttemptUpdateInput = {
      status: input.status,
      updatedAt: input.updatedAt
    };

    if (input.providerResponse) {
      updateData.providerResponse = input.providerResponse;
    }

    const updatedPaymentAttempt = await this.client.paymentAttempt.update({
      data: updateData,
      where: {
        id: paymentAttempt.id
      }
    });

    if (input.status === "CAPTURED") {
      await createOutboxEvent(this.client, {
        aggregateId: paymentAttempt.orderId,
        aggregateType: "payment_attempt",
        eventType: "payment.captured",
        payload: {
          orderId: paymentAttempt.orderId,
          paymentAttemptId: paymentAttempt.id,
          providerPaymentId: paymentAttempt.providerPaymentId
        }
      });
    }

    return mapPaymentAttempt(updatedPaymentAttempt);
  }
}

const orderInclude = {
  items: true,
  paymentAttempts: {
    orderBy: {
      createdAt: "desc"
    },
    take: 1
  }
} as const;

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

const mapOrder = (order: {
  createdAt: Date;
  currency: string;
  customerId: string;
  id: string;
  items: Array<{
    lineTotalAmount: bigint;
    productSnapshot: Prisma.JsonValue;
    quantity: number;
    sku: string;
    unitPriceAmount: bigint;
  }>;
  orderNumber: bigint;
  paymentAttempts: Array<{
    status: string;
  }>;
  status: string;
  totalAmount: bigint;
  updatedAt: Date;
}): CheckoutOrderRecord => ({
  createdAt: order.createdAt,
  currency: order.currency,
  customerId: order.customerId,
  id: order.id,
  items: order.items.map((item) => ({
    lineTotalAmount: Number(item.lineTotalAmount),
    name: readProductName(item.productSnapshot),
    quantity: item.quantity,
    sku: item.sku,
    unitPriceAmount: Number(item.unitPriceAmount)
  })),
  orderNumber: order.orderNumber.toString(),
  paymentStatus: order.paymentAttempts[0]?.status ?? null,
  status: order.status,
  totalAmount: Number(order.totalAmount),
  updatedAt: order.updatedAt
});

const mapPaymentAttempt = (paymentAttempt: {
  amount: bigint;
  createdAt: Date;
  currency: string;
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string | null;
  status: string;
}): CheckoutPaymentAttemptRecord => ({
  amount: Number(paymentAttempt.amount),
  createdAt: paymentAttempt.createdAt,
  currency: paymentAttempt.currency,
  id: paymentAttempt.id,
  orderId: paymentAttempt.orderId,
  provider: paymentAttempt.provider,
  providerPaymentId: paymentAttempt.providerPaymentId,
  status: paymentAttempt.status
});

const readProductName = (snapshot: Prisma.JsonValue) => {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    const value = snapshot["name"];

    if (typeof value === "string") {
      return value;
    }
  }

  return "Product";
};
