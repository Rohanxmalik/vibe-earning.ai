import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

@Injectable()
export class StripeProvider extends PaymentProvider {
  readonly name = "stripe";
  async payout(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error("StripeProvider.payout not configured — implement Stripe Connect transfer (set STRIPE_SECRET_KEY)");
  }
  async collect(_req: CollectRequest): Promise<CollectResult> {
    throw new Error("StripeProvider.collect not configured");
  }
}
