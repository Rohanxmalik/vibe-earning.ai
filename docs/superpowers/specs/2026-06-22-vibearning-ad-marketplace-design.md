# vibearning — AI-Spinner Ad Marketplace — Design

- **Date:** 2026-06-22
- **Status:** Approved design (pre-implementation)
- **Author:** Rohan (with Claude Code)
- **Topic:** India-first clone of vibearning.ai — an ad marketplace inside AI coding-agent wait states

---

## 1. Context & Background

[vibearning.ai](https://vibearning.ai/) (by Andrew McCalip / ShiftKeys, Inc., launched 2026-06-11) is **not** a consumer cashback app. It is a **two-sided advertising marketplace** that sells the "Thinking…" status line shown by AI coding agents (Claude Code, Codex) while they work. A VS Code extension replaces the spinner verb with one short sponsored line; the developer whose machine showed it earns ~50% of the ad revenue. Advertisers bid for the line in an English-ascending auction.

Key mechanics observed (sources in §15):
- Block = **1,000 × 5-second impressions**; minimum bid **$1/block**; **clicks billed at 50× an impression**.
- Developer revenue share **~50%**; payout **only via Stripe Connect**, **$10** minimum, monthly.
- Heavy anti-fraud: 5s view threshold, per-user caps, salted one-way IP hashing, multi-account/VPN-rotation detection, server killswitch. No code/prompts collected.
- Extension is open-source TypeScript; the backend, auction engine, and advertiser portal are private.

### The India opportunity
vibearning.ai pays **only through Stripe Connect**, and per its own FAQ **India is in "preview" status** — Indian developers effectively cannot cash out. India has a large, fast-growing Claude Code / Codex / Gemini CLI user base. **The wedge is the payout rail:** capture Indian developer supply that is locked out of Stripe, sell their attention to **global** advertisers, and pay out in INR via UPI/RazorpayX.

### Reframing decided with the user
- **Supply side = Indian developers** (India-first; the ones Stripe locks out).
- **Demand side = global advertisers** (foreign brands, even the same advertisers vibearning targets), seeded by direct outreach but transacted self-serve.
- India-specific value is on the **payout/entity** side, not demand.

---

## 2. Goals

- Ship a **full self-serve two-sided marketplace** functionally equivalent to vibearning.ai.
- Support three injectable agent surfaces: **Claude Code, Codex, Gemini CLI**.
- **Dual payment providers (Stripe + Razorpay), both directions** (collect from advertisers + pay out to developers), behind one abstraction.
- Pay Indian developers in **INR via Razorpay/UPI**; pay non-India developers via **Stripe Connect**.
- Match vibearning' anti-fraud and privacy posture (trust is the product).

## 3. Non-Goals (v1 / YAGNI)

- Cursor, GitHub Copilot, Windsurf adapters (closed Electron UIs — fragile injection, higher ban risk).
- Crypto / stablecoin payouts.
- Wise/Payoneer or other non-India payout rails beyond Stripe Connect default.
- Mobile app; programmatic/RTB exchange; audience targeting beyond surface selection.
- ML-based fraud detection (start rules-based).
- Consumer/shopper cashback (explicitly a different product — out of scope).

---

## 4. Locked Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Goal / model | Full self-serve marketplace; global demand, India-first supply |
| 2 | Sell model | Full self-serve auction (outreach used only to seed early advertisers) |
| 3 | Surfaces | Claude Code (panel + terminal), Codex (panel), Gemini CLI (terminal) |
| 4 | Money rails | Dual provider — Stripe **and** Razorpay, both collect **and** payout, abstracted |
| 5 | Stack | Full TypeScript |
| 6 | Build approach | **A** — Turborepo monorepo, vertical slices, vibearning-style block auction |
| 7 | Ledger base currency | **INR** (India entity); FX snapshot stored per non-INR charge |

---

## 5. Architecture

Turborepo + pnpm monorepo:

```
vibearning/
  apps/
    extension/   VS Code ext (TS) — 3 adapters, view-tracking, killswitch
    api/         NestJS — Auth, Auction, Serve, Metrics, Ledger, Payout, Billing, Fraud, Admin
    portal/      Next.js — advertiser dashboard + marketing/landing
  packages/
    shared/      types, zod DTOs, shared across ext↔api↔portal
    payments/    PaymentProvider abstraction (Stripe + Razorpay adapters)
  infra/         docker-compose, migrations, IaC
```

**Data stores**
- **Postgres** — source of truth (accounts, campaigns, blocks, bids, impression ledger, escrow, payouts). ACID required for money.
- **Redis** — live bid ranking (sorted set per surface), rate-limit + frequency-cap counters, serve cache, global killswitch flag.

**Rationale:** one language end-to-end (extension is forced to TypeScript by the VS Code API; sharing types and the payment abstraction across all apps maximizes velocity for a small team). Monorepo keeps `shared`/`payments` in lockstep with both the extension and the backend.

---

## 6. Runtime Data Flow

```
Advertiser → portal: signup → create campaign → buy blocks
   (Billing.collect via Stripe|Razorpay → funds become ESCROW liability in ledger)
   → set bid → Auction ranks in Redis (sorted set per surface)

Dev → ext: install → Google OAuth → install-scoped token (OS keychain)
Agent enters wait-state:
   ext  GET /serve?surface=claude-code-terminal
        → Serve returns top-ranked ad (Redis), respecting pacing + frequency caps
   ext  renders ad in spinner line, starts 5s view timer (focused + visible only)
   ext  POST /events  (idempotent: install_id + campaign + nonce) on valid 5s view / click
        → Metrics validates (≥5s, caps, fraud score)
        → Ledger: debit advertiser escrow, credit dev ~50%, book platform cut
Dev balance ≥ threshold:
   Payout routes  India→Razorpay/UPI ,  else→Stripe Connect  → pay + settle ledger
```

**Money model:** advertiser prepays blocks → held as **escrow liability** → consumed per **delivered** impression (click = 50× impression) → split developer/platform. Unused or over-delivered inventory → refund/credit. **Serve ≠ impression**: inventory decrements only on a server-confirmed 5s view.

---

## 7. Extension Design (`apps/extension`)

TypeScript + esbuild + vitest (mirrors vibearning' open structure).

```
src/
  adapters/      per-surface inject + wait-state detect + restore
    claude-code  panel spinner overlay · terminal status line · spinner verb
    codex        panel thinking-shimmer
    gemini-cli   terminal spinner line
  activation/    lifecycle, ad rotation, self-update, status-bar earnings display
  auth/          Google OAuth → token in VS Code SecretStorage (OS keychain)
  viewTracking/  5s timer — counts only while window focused + spinner visible
  metrics/       idempotent event emit, offline queue + retry with backoff
  killswitch/    polls server flag → global no-op
```

- **Injection:** terminal surfaces swap the spinner verb / status line; panel surfaces use a webview overlay. Adapters are **versioned** and guarded: on any unrecognized host/vendor UI change they **fail to a silent no-op** and never break the host agent. The killswitch is the global kill-all.
- **Privacy (deliberately matches vibearning — trust is the product):** collects only ad-event id, on-screen visibility metric, per-install id, host/extension version, account id, and a **salted one-way IP hash** (never raw IP). **Never** collects code, prompts, or file contents.

---

## 8. Auction & Serving (`Auction` + `Serve` modules)

- **Block** = 1,000 × 5-second impressions. **Bid** = price per block (configurable floor). **Click = 50× impression.**
- **English-ascending auction per surface:** Redis sorted set, score = bid (tiebreak = time). Highest serves #1; the rest queue.
- **`GET /serve`:** returns the top-ranked campaign that has remaining inventory, is within the requesting install's frequency cap, and is within its pacing budget. Payload = creative (≤60-char copy, https URL, optional ≤64 KB brand icon).
- **Serve ≠ impression.** Block inventory decrements only on a server-confirmed 5s view via `/events` — prevents paying for unseen serves.
- **Pacing:** Redis token-bucket per campaign keyed off the advertiser's "delivery speed" preference (asap / even).
- **Over-delivery protection:** stop serving at block exhaustion; if a race overshoots, the platform absorbs the extra (vibearning rule).

---

## 9. Ledger & Payments

### Ledger (`Ledger` module — double-entry, append-only, immutable)
- Ledger accounts: *advertiser escrow* (liability), *dev earnings payable* (liability), *platform revenue*, *payment fees*.
- Per confirmed impression: `impr_price = bid / 1000` (click = 50×) → **debit** advertiser escrow, **credit** dev payable ~50%, **credit** platform the remainder (net of fees).
- Entries are immutable; balances are derived sums (no mutation — matches the immutability rule). Each ledger write is keyed to the originating event id → idempotent.
- **Base currency = INR**; store FX rate at event time for non-INR charges.

### Payments (`packages/payments` — dual-provider abstraction)
```ts
interface PaymentProvider {
  collect(payerId, amount, currency, method): ChargeResult   // money IN (advertiser)
  payout(payeeId, amount, currency, dest): PayoutResult      // money OUT (developer)
  onboardPayee(payeeId): PayeeAccount                        // Connect / RazorpayX contact
  handleWebhook(raw): NormalizedPaymentEvent
}
```
- **StripeAdapter:** PaymentIntents (in) · Stripe Connect transfers/payouts (out).
- **RazorpayAdapter:** Orders/Checkout (in) · RazorpayX payouts → UPI/IMPS/bank (out).
- **Routing service:**
  - *Collect:* advertiser chooses provider at checkout (Stripe default for international cards; Razorpay option).
  - *Payout:* by developer country — **India → Razorpay/UPI**, else → **Stripe Connect**. Fallback if a provider is unavailable.
- **Threshold:** balance ≥ INR-equivalent (~$10), after KYC completes (Razorpay: PAN + bank/UPI; Stripe: Connect onboarding). Monthly or on-demand.
- **Invariant:** never pay a developer more than collected + consumed escrow; reconcile via ledger.

---

## 10. Fraud & Anti-Abuse (`Fraud` module)

Parity with vibearning here is mandatory — weak fraud controls drive advertisers away.

- **Valid impression** = ≥5s visible + window focused + human-initiated wait + within per-user spacing + within hourly/daily caps.
- **Server decides, never trusts the client.** The extension sends signals; the server validates and assigns a fraud score.
- Dedup via event nonce (reject replays). Multi-account / pooling detection: install-id + salted-IP-hash clustering + velocity anomalies. VPN-rotation / telemetry tampering → void earnings + suspend.
- **Killswitch** scopes: global / per-account / per-campaign.
- **Advertiser side:** creative moderation (admin review), malicious-URL scanning, credit/refund on undelivered or fraud-voided impressions.

---

## 11. Data Model (Postgres — core tables)

```
accounts(id, type:dev|advertiser|admin, email, oauth_sub, country, created_at)
dev_installs(id, account_id, install_id, host, ext_version, ip_hash, last_seen)
payee_accounts(id, account_id, provider, external_id, kyc_status, method)
campaigns(id, advertiser_id, copy≤60, url, icon_ref, surface_targets[], delivery_speed, status)
blocks(id, campaign_id, qty=1000, bid_per_block, currency, payment_ref, purchased_at)
bids(id, campaign_id, surface, amount, status)                  -- feeds Redis ranking
ad_events(id, install_id, campaign_id, surface, type:impression|click,
          nonce UNIQUE, visible_ms, valid, fraud_score, created_at)
ledger_entries(id, event_id, debit_acct, credit_acct, amount, currency, fx_rate, created_at)  -- append-only
payouts(id, account_id, provider, amount, currency, status, external_ref, ledger_ref, created_at)
killswitch(scope, target_id, active)
fraud_flags(id, subject, rule, severity, created_at)
```
Balances are derived sums over `ledger_entries`. Idempotency enforced by `ad_events(install_id, nonce)` uniqueness.

---

## 12. Error Handling

- All boundaries (ext→api, portal→api, webhooks) validated with **zod**; fail fast with clear errors.
- **Extension:** serve/network failure → **no ad, never block the agent**; events queue offline and retry with backoff; any adapter error → silent no-op + telemetry.
- **Money:** webhook-driven state machine, idempotent on the provider's event id; all money operations wrapped in a DB transaction; nightly **reconciliation** job for stuck/missed states; never double-credit or double-pay.
- **Redis down:** degrade gracefully to house ads / no-ad.
- Idempotency keys required on every mutating money endpoint.

### Security
- **Verify every payment webhook signature** (Stripe `Stripe-Signature`, Razorpay `X-Razorpay-Signature`) before acting; reject unsigned/invalid payloads. This is the integrity boundary for all money-in confirmation.
- **No hardcoded secrets** — all provider keys, OAuth secrets, and DB/Redis credentials via environment / secret manager; validated present at startup; `.env*` git-ignored.
- Extension tokens stored only in OS keychain (VS Code SecretStorage); server stores salted IP hashes only.
- Rate-limit `/serve` and `/events` per install; authorize every portal/admin action server-side.

---

## 13. Testing (vitest; target ≥80% coverage)

- **Unit:** adapters (mock surfaces), view-tracking timer, auction ranking, **ledger double-entry balancing**, payment adapters (mock Stripe/Razorpay), fraud rules.
- **Integration** (testcontainers: Postgres + Redis): serve→event→ledger→payout happy path; fraud rejections; escrow invariants.
- **E2E:** portal flows (signup → buy block → bid → stats); extension host test (install → serve → impression).
- **Invariant/property tests:** ledger always balances; never pay > collected escrow.

---

## 14. Phasing (Vertical Slices)

1. **Supply MVP** — extension (3 adapters) + auth + view-tracking + metrics + admin house-ads + serve. *Devs see ads; events logged; no money.*
2. **Payouts** — ledger + balances + Payout (Razorpay + Stripe) + KYC onboarding. *Devs get paid.*
3. **Self-serve demand** — portal + advertiser auth + campaign/block/bid + Billing collect (Stripe + Razorpay) + escrow + live auction ranking. *Advertisers self-serve.*
4. **Hardening** — fraud hardening + pacing + over-delivery + creative moderation + observability/scale.

---

## 15. Legal / Regulatory (note — not code)

- India Pvt Ltd entity; **IEC** + **FIRC** for export-of-service receipts; **GST** on platform fee; **TDS** on developer payouts.
- Advertiser ToS, developer ToS, privacy policy.
- **Vendor risk acknowledged:** injecting into Claude Code / Codex / Gemini CLI UIs is adversarial to Anthropic/OpenAI/Google; their ToS or UI changes can break or ban the extension. Same risk vibearning carries. Mitigate with versioned adapters + killswitch; accept as a strategic risk.

---

## 16. Risks

- **Demand liquidity** is the whole business — without advertisers bidding, developers earn ₹0 and churn. Seed via outreach; the auction is worthless empty.
- **Indian-targeted CPMs are far below US CPMs** — model whether earnings clear the payout threshold for real usage before over-investing.
- **Commodity product** — vibearning saw two clones within 48h. Moat = advertiser relationships + the India payout rail, not the tech.
- **Cross-border collection** complexity (FX, FIRC, chargebacks) on the advertiser side.
- **Self-reported vibearning earnings are noisy** ($0.43–$10+ per multi-hour session); treat all economic assumptions as directional.

---

## 17. Sources

- [vibearning.ai](https://vibearning.ai/) · [Brands/advertise section](https://vibearning.ai/#brands) · [FAQ & fraud rules](https://vibearning.ai/faq)
- [GitHub: andrewmccalip/vibearning.ai (open-source extension)](https://github.com/andrewmccalip/vibearning.ai)
- [Hacker News launch discussion](https://news.ycombinator.com/item?id=48493940)
- [Product Hunt](https://www.producthunt.com/products/vibearning-ai)
- [Stork.AI review (2026)](https://www.stork.ai/en/vibearning-ai)
- [YouTube: "I Made Money While Claude Code Was Thinking"](https://www.youtube.com/watch?v=a_nRs8d9jGo)

---

## 18. Open Questions

- Confirm INR ledger base currency (recommended) vs USD base.
- Exact bid floor and developer revenue share % (vibearning ≈ 50%).
- Payout cadence: monthly vs on-demand above threshold.
- Hosting region/provider (recommend an India region for latency + data residency).
