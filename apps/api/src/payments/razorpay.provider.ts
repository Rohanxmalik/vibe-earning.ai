import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

/** Subset of the Razorpay SDK we use. Kept narrow so tests can inject a fake. */
export interface RazorpayClient {
  orders: {
    create(opts: { amount: number; currency: string; receipt?: string; notes?: Record<string, string> }): Promise<{ id: string; status: string }>;
  };
}

@Injectable()
export class RazorpayProvider extends PaymentProvider {
  readonly name = "razorpay";
  private cached?: RazorpayClient;

  /** Lazily builds the real SDK client from env. Tests bypass this via setClient. */
  protected buildClient(): RazorpayClient {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("razorpay_not_configured: set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Razorpay = require("razorpay");
    return new Razorpay({ key_id: keyId, key_secret: keySecret }) as RazorpayClient;
  }

  /** Test/DI seam: inject a fake client so SDK construction (and creds) aren't needed. */
  setClient(client: RazorpayClient): void {
    this.cached = client;
  }

  private client(): RazorpayClient {
    return (this.cached ??= this.buildClient());
  }

  async collect(req: CollectRequest): Promise<CollectResult> {
    const order = await this.client().orders.create({
      amount: req.amountPaise,
      currency: req.currency,
      notes: req.description ? { description: req.description } : undefined,
    });
    // Order is created; it flips to paid only once the payment.captured webhook arrives.
    return { providerRef: order.id, status: "pending" };
  }

  async payout(_req: PayoutRequest): Promise<PayoutResult> {
    // RazorpayX payouts are a separate product/API (not in the `razorpay` SDK).
    // Wire RAZORPAYX_ACCOUNT_NUMBER + the /v1/payouts REST call (and complete KYC)
    // before enabling INR cashouts.
    throw new Error("razorpayx_not_configured: implement RazorpayX /v1/payouts before enabling INR payouts");
  }
}
