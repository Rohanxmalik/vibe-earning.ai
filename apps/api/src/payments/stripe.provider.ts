import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

/** Subset of the Stripe SDK we use. Kept narrow so tests can inject a fake. */
export interface StripeClient {
  paymentIntents: {
    create(opts: { amount: number; currency: string; description?: string }): Promise<{ id: string; status: string }>;
  };
  transfers: {
    create(opts: { amount: number; currency: string; destination: string }): Promise<{ id: string }>;
  };
}

@Injectable()
export class StripeProvider extends PaymentProvider {
  readonly name = "stripe";
  private cached?: StripeClient;

  /** Lazily builds the real SDK client from env. Tests bypass this via setClient. */
  protected buildClient(): StripeClient {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("stripe_not_configured: set STRIPE_SECRET_KEY");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Stripe = require("stripe");
    return new Stripe(key) as StripeClient;
  }

  /** Test/DI seam: inject a fake client so SDK construction (and creds) aren't needed. */
  setClient(client: StripeClient): void {
    this.cached = client;
  }

  private client(): StripeClient {
    return (this.cached ??= this.buildClient());
  }

  async collect(req: CollectRequest): Promise<CollectResult> {
    const intent = await this.client().paymentIntents.create({
      amount: req.amountPaise,
      currency: req.currency.toLowerCase(),
      description: req.description,
    });
    // Confirmation arrives async via the payment_intent.succeeded webhook.
    return { providerRef: intent.id, status: intent.status === "succeeded" ? "paid" : "pending" };
  }

  async payout(req: PayoutRequest): Promise<PayoutResult> {
    // Stripe Connect transfer to the developer's connected account (payeeRef).
    const transfer = await this.client().transfers.create({
      amount: req.amountPaise,
      currency: req.currency.toLowerCase(),
      destination: req.payeeRef,
    });
    return { providerRef: transfer.id, status: "paid" };
  }
}
