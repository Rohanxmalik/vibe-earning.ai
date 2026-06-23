import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

/** Subset of the Razorpay SDK we use. Kept narrow so tests can inject a fake. */
export interface RazorpayClient {
  orders: {
    create(opts: { amount: number; currency: string; receipt?: string; notes?: Record<string, string> }): Promise<{ id: string; status: string }>;
  };
}

/** Minimal HTTP seam for the RazorpayX REST API (payouts aren't in the SDK). */
export type HttpFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** Map RazorpayX payout lifecycle to our 3-state result. */
export function mapRazorpayXPayoutStatus(status: string): PayoutResult["status"] {
  if (status === "processed") return "paid";
  if (["failed", "rejected", "cancelled", "reversed"].includes(status)) return "failed";
  return "pending"; // queued | pending | processing | scheduled
}

@Injectable()
export class RazorpayProvider extends PaymentProvider {
  readonly name = "razorpay";
  private cached?: RazorpayClient;
  private http: HttpFn = (url, init) => fetch(url, init) as unknown as ReturnType<HttpFn>;

  /** Test/DI seam for the RazorpayX REST calls. */
  setHttp(fn: HttpFn): void {
    this.http = fn;
  }

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

  async payout(req: PayoutRequest): Promise<PayoutResult> {
    // RazorpayX payouts are a separate product/API (not in the `razorpay` SDK), so
    // we call the REST endpoint directly. payeeRef = the dev's RazorpayX fund_account_id
    // (created + verified during KYC and stored on PayoutDestination.providerRef).
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const accountNumber = process.env.RAZORPAYX_ACCOUNT_NUMBER;
    if (!keyId || !keySecret || !accountNumber) {
      throw new Error("razorpayx_not_configured: set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET/RAZORPAYX_ACCOUNT_NUMBER");
    }
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await this.http("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({
        account_number: accountNumber,
        fund_account_id: req.payeeRef,
        amount: req.amountPaise,
        currency: req.currency,
        mode: req.method === "bank" ? "IMPS" : "UPI",
        purpose: "payout",
        queue_if_low_balance: true,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`razorpayx_payout_failed: ${res.status} ${body?.error?.description ?? ""}`.trim());
    return { providerRef: body.id, status: mapRazorpayXPayoutStatus(body.status) };
  }
}
