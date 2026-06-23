# Payments & KYC setup

Exactly what to sign up for, what KYC each needs, and which key goes in which env var. The **code is done** — this is account setup only. Order matters: company + bank first (`LAUNCH_CHECKLIST.md` Phase 1), then this.

> Money in (advertisers) = **Stripe** (global) + **Razorpay** (India).
> Money out (developers) = **RazorpayX** (UPI/bank, India) + **Stripe** (non-India).

---

## 1. Razorpay — collect from Indian advertisers

1. Create a Razorpay account; complete **business KYC** (PAN, GST, bank proof, company docs).
2. Get **API keys**: Dashboard → Settings → API Keys → Generate.
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
3. Create a **webhook**: Dashboard → Settings → Webhooks → Add.
   - URL: `https://api.yourdomain.com/webhooks/razorpay`
   - Events: `payment.captured`, `payment.failed` (plus payout events below).
   - Copy the **webhook secret** → `RAZORPAY_WEBHOOK_SECRET`.
- **Done:** a sandbox order succeeds, then a real ₹1 capture marks a `BlockPurchase` paid and funds escrow.

## 2. RazorpayX — pay out to developers (the India wedge — prioritize)

1. Activate **RazorpayX** (separate from Razorpay collections); complete its business KYC.
2. Fund the **virtual account** RazorpayX gives you — payouts draw from it.
   - `RAZORPAYX_ACCOUNT_NUMBER` = that virtual account number.
3. Payout webhooks (same Razorpay webhook UI or RazorpayX section):
   - URL: `https://api.yourdomain.com/webhooks/razorpay`
   - Events: `payout.processed`, `payout.failed`, `payout.reversed`.
4. **KYC/contact + fund_account flow:** when an admin verifies a developer's UPI/bank in the
   ops console, store the RazorpayX **`fund_account_id`** on `PayoutDestination.providerRef`
   (the verify endpoint already accepts `providerRef`). Payouts use it as the destination.
- **Done:** a ₹1 test payout to your own UPI settles, and the `payout.processed` webhook flips the `Payout` to settled + debits the ledger.

## 3. Stripe — collect from foreign advertisers / pay non-India devs

1. Create a Stripe account; complete KYC. Enable **Connect** only if you'll pay non-India developers.
2. **API key:** Developers → API keys → Secret key → `STRIPE_SECRET_KEY`.
3. **Webhook:** Developers → Webhooks → Add endpoint.
   - URL: `https://api.yourdomain.com/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed` (+ payout/transfer events if using Connect).
   - Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`.
- **Done:** a Stripe test PaymentIntent marks a purchase paid via the webhook.

---

## Env var → where it comes from

| Env var | Source | Used for |
|---------|--------|----------|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay → API Keys | collect (India) |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Webhooks | verify inbound collect webhooks |
| `RAZORPAYX_ACCOUNT_NUMBER` | RazorpayX virtual account | source of developer payouts |
| `STRIPE_SECRET_KEY` | Stripe → API keys | collect (global) / payout (non-India) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks | verify inbound Stripe webhooks |

Put these in the host's secret manager (or `.env` next to `docker-compose.prod.yml`). See `.env.prod.example`.

## Behaviour if unset (safe by default)

Each adapter throws a clear `*_not_configured` error when its keys are missing, and the global
exception filter keeps that detail out of client responses. So a half-configured prod won't
silently mis-handle money — the affected path fails loudly while everything else works.

## Go-live verification

- [ ] Razorpay: real ₹1 advertiser top-up → escrow funded.
- [ ] RazorpayX: real ₹1 developer payout → settles + ledger debited.
- [ ] Stripe: test PaymentIntent → purchase paid via webhook.
- [ ] All three webhooks show **2xx** deliveries in their dashboards.
- [ ] Rotate any keys that were ever pasted into chat/email.
