export interface PayoutRequest { payeeRef: string; amountPaise: number; currency: string; method?: string }
export interface PayoutResult { providerRef: string; status: "paid" | "pending" | "failed" }
export interface CollectRequest { amountPaise: number; currency: string; description?: string }
export interface CollectResult { providerRef: string; status: string; checkoutUrl?: string }

/** Abstract DI token; impls wrap a real PSP SDK. */
export abstract class PaymentProvider {
  abstract readonly name: string; // "stripe" | "razorpay"
  abstract payout(req: PayoutRequest): Promise<PayoutResult>;
  abstract collect(req: CollectRequest): Promise<CollectResult>; // wired in Plan 07
}
