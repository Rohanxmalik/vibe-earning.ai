import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

@Injectable()
export class RazorpayProvider extends PaymentProvider {
  readonly name = "razorpay";
  async payout(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error("RazorpayProvider.payout not configured — implement RazorpayX payout (set RAZORPAYX_KEY)");
  }
  async collect(_req: CollectRequest): Promise<CollectResult> {
    throw new Error("RazorpayProvider.collect not configured");
  }
}
