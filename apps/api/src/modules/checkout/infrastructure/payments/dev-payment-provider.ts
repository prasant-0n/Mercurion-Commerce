import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";
import type {
  CreateProviderPaymentInput,
  PaymentProvider,
  ProviderPaymentResult,
  ProviderPaymentStatus
} from "@/modules/checkout/application/ports/payment-provider";

export class DevPaymentProvider implements PaymentProvider {
  createPayment(
    input: CreateProviderPaymentInput
  ): Promise<ProviderPaymentResult> {
    const providerPaymentId = `pay_${input.paymentAttemptId.replaceAll("-", "")}`;

    return Promise.resolve({
      provider: env.PAYMENT_PROVIDER,
      providerPaymentId,
      rawResponse: {
        amount: input.amount,
        currency: input.currency,
        mode: "dev",
        orderId: input.orderId,
        paymentMethod: input.paymentMethod.type,
        providerPaymentId
      },
      redirectUrl: `${env.PAYMENT_CHECKOUT_BASE_URL}/${providerPaymentId}`
    });
  }

  lookupPaymentStatus(): Promise<ProviderPaymentStatus> {
    return Promise.resolve("PENDING");
  }

  verifyWebhookSignature(input: {
    rawBody: string;
    signature: string | undefined;
  }): boolean {
    if (!input.signature) {
      return false;
    }

    const expectedSignature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
      .update(input.rawBody)
      .digest("hex");

    const expected = Buffer.from(expectedSignature, "hex");
    const received = Buffer.from(input.signature, "hex");

    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
