import { Router } from "express";

import { CheckoutService } from "@/modules/checkout/application/services/checkout.service";
import { asyncHandler } from "@/shared/http/async-handler";

const createDefaultCheckoutService = () => new CheckoutService();

export const createPaymentsRouter = (
  checkoutService: CheckoutService = createDefaultCheckoutService()
) => {
  const router = Router();

  router.post(
    "/webhooks/razorpay",
    asyncHandler(async (request, response) => {
      const result = await checkoutService.handleRazorpayWebhook({
        body: request.body,
        eventId: request.get("x-razorpay-event-id"),
        rawBody: request.rawBody ?? JSON.stringify(request.body ?? {}),
        signature: request.get("x-razorpay-signature")
      });

      response.status(200).json(result);
    })
  );

  return router;
};
