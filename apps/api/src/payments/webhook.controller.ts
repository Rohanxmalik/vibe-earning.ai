import { Body, Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import { WebhookService } from "./webhook.service";
import { verifyRazorpaySignature, verifyStripeSignature } from "./webhook-verify";

const RZP_SECRET = () => process.env.RAZORPAY_WEBHOOK_SECRET ?? "dev-razorpay-webhook-secret";
const STRIPE_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET ?? "dev-stripe-webhook-secret";

// Nest populates rawBody when the app is created with { rawBody: true }.
type RawReq = { rawBody?: Buffer };

@Controller("webhooks")
export class WebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post("razorpay")
  @HttpCode(200)
  async razorpay(
    @Req() req: RawReq,
    @Headers("x-razorpay-signature") signature: string,
    @Body() body: Record<string, any>,
  ) {
    const raw = req.rawBody?.toString("utf8") ?? "";
    if (!verifyRazorpaySignature(raw, signature, RZP_SECRET())) throw new UnauthorizedException("bad_signature");

    const event = body?.event as string | undefined;

    // Payout lifecycle (RazorpayX) — providerRef is the payout id.
    const payoutId: string | undefined = body?.payload?.payout?.entity?.id;
    if (payoutId && event?.startsWith("payout.")) {
      if (event === "payout.processed") await this.webhooks.markPayoutSettled(payoutId);
      else if (event === "payout.failed" || event === "payout.reversed") await this.webhooks.markPayoutFailed(payoutId);
      return { ok: true };
    }

    // Collection lifecycle — providerRef is the order id.
    const orderId: string | undefined =
      body?.payload?.payment?.entity?.order_id ?? body?.payload?.order?.entity?.id;
    if (!orderId) return { ok: true, ignored: true };

    if (event === "payment.captured" || event === "order.paid") await this.webhooks.markPurchasePaid(orderId);
    else if (event === "payment.failed") await this.webhooks.markPurchaseFailed(orderId);
    return { ok: true };
  }

  @Post("stripe")
  @HttpCode(200)
  async stripe(
    @Req() req: RawReq,
    @Headers("stripe-signature") signature: string,
    @Body() body: Record<string, any>,
  ) {
    const raw = req.rawBody?.toString("utf8") ?? "";
    if (!verifyStripeSignature(raw, signature, STRIPE_SECRET())) throw new UnauthorizedException("bad_signature");

    const type = body?.type as string | undefined;
    const id: string | undefined = body?.data?.object?.id;
    if (!id) return { ok: true, ignored: true };

    if (type === "payment_intent.succeeded") await this.webhooks.markPurchasePaid(id);
    else if (type === "payment_intent.payment_failed") await this.webhooks.markPurchaseFailed(id);
    return { ok: true };
  }
}
