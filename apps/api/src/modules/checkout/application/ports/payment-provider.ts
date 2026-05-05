export type PaymentMethodInput = {
  type: "CARD" | "UPI_INTENT";
};

export type ProviderPaymentStatus =
  | "AUTHORIZED"
  | "CANCELLED"
  | "CAPTURED"
  | "FAILED"
  | "PENDING";

export type CreateProviderPaymentInput = {
  amount: number;
  currency: string;
  customerId: string;
  idempotencyKey: string;
  orderId: string;
  paymentAttemptId: string;
  paymentMethod: PaymentMethodInput;
};

export type ProviderPaymentResult = {
  provider: string;
  providerPaymentId: string;
  rawResponse: Record<string, unknown>;
  redirectUrl: string;
};

export interface PaymentProvider {
  createPayment(
    input: CreateProviderPaymentInput
  ): Promise<ProviderPaymentResult>;
  lookupPaymentStatus(
    providerPaymentId: string
  ): Promise<ProviderPaymentStatus>;
  verifyWebhookSignature(input: {
    rawBody: string;
    signature: string | undefined;
  }): boolean;
}
