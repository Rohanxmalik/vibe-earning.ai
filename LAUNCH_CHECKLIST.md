# Launch Checklist — the non-coding steps to go live

The software is built and tested. **None of the items below are coding tasks** — they're
accounts, paperwork, and decisions only you (the founders) can do. Do them roughly in
this order. Each says *what it is*, *why*, and *what "done" looks like*.

---

## Phase 0 — Decisions (a weekend)

- [ ] **Pick the company name + who owns what.** Founder equity split, in writing.
- [ ] **Decide the revenue share.** We currently pay developers ~50% (configurable). Confirm the number.
- [ ] **Decide pricing floor.** Minimum bid per 1,000 impressions, and minimum payout (currently ₹100).

## Phase 1 — Company & banking (2–6 weeks, do early; everything waits on this)

- [ ] **Register an Indian company** (Pvt Ltd is standard). Use a service like Razorpay Rize, Clerky-equivalent, or a CA.
- [ ] **Get a company bank account** (current account).
- [ ] **GST registration.** You charge a platform fee → GST applies.
- [ ] **IEC (Import Export Code).** Needed because foreign advertisers paying you = "export of services."
- [ ] **Talk to a CA about TDS** — you must deduct a little tax when paying developers, and file it.
- **Done looks like:** a registered company with a bank account, GST number, and IEC.

## Phase 2 — Payment accounts (1–3 weeks; the money rails)

- [ ] **Razorpay account** (for collecting money from advertisers in India). Complete their KYC.
- [ ] **RazorpayX account** (for *paying out* to developers via UPI/bank). This needs business KYC + a funded virtual account. **This is the India payout wedge — prioritize it.**
- [ ] **Stripe account** (for foreign advertisers / non-India payouts). Complete KYC; enable Connect if paying non-India devs.
- [ ] Get the **API keys + webhook signing secrets** from each, and hand them to your engineer to put in the server's secret settings (`STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID/SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, `*_WEBHOOK_SECRET`).
- [ ] In each dashboard, **point webhooks** at `https://your-api-domain/webhooks/razorpay` and `/webhooks/stripe`.
- **Done looks like:** test payments succeed in their sandbox, then a real ₹1 end-to-end.
- 📄 **Engineer guide:** `docs/launch/PAYMENTS_SETUP.md` — account-by-account steps + exactly which key goes in which env var.

## Phase 3 — Hosting / deploy (a few days; engineer-assisted, but you buy the accounts)

- [ ] **A server host** for the backend (Render, Railway, Fly.io, or a cloud VM — pick an **India region** for speed + data residency).
- [ ] **Managed PostgreSQL + Redis** (most hosts offer these as add-ons). The API applies migrations automatically on boot and exposes a `/health/ready` check for the load balancer.
- [ ] **Portal hosting** (Vercel is easiest for the Next.js website).
- [ ] **A domain name** + SSL (the host usually handles SSL).
- [ ] **Sentry account** (free tier) for crash alerts; paste the DSN into settings.
- [ ] **An email provider** (Amazon SES / SendGrid / Resend) — needed so password-reset, email-verification, and payout emails actually send. The code has a ready "Notifier" slot your engineer points at it (until then, emails are only logged, not sent).
- [ ] After first deploy, run the **seed script** (`pnpm --filter @kbi/api seed` with `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) to create your admin login + starter house ads — no manual database work.
- **Done looks like:** the website + API are live on your domain, 24/7. (The CD pipeline already builds the app images; set a `DEPLOY_WEBHOOK` secret to auto-roll them.)
- 📄 **Engineer guide:** `docs/launch/DEPLOY.md` — step-by-step runbook (managed-platform or single-VM), env template, smoke test, rollback.

## Phase 4 — The ad-injection (the hard technical piece; needs an engineer + the live tools)

- [ ] Build **one** real "adapter" first — Claude Code is the best candidate because it has an *official* status-line feature we can use without hacking. **A working prototype + step-by-step guide already exists: `docs/extension/claude-code-statusline.md`** (the line-composing code is built and unit-tested; only live verification + billing/attribution remain).
- [ ] **Strongly prefer official integration points** over hacking another tool's UI — far lower legal/ban risk (see legal note below).
- [ ] Test it earns end-to-end on a real machine, then add Codex / Gemini.
- **Done looks like:** an ad actually shows in a real AI tool's spinner and a developer gets paid.

> **Engineer-facing detail guides now live in the repo:** `docs/launch/DEPLOY.md` (Phase 3), `docs/launch/PAYMENTS_SETUP.md` (Phase 2), `docs/legal/` (Phase 6 templates), `docs/extension/claude-code-statusline.md` (Phase 4).

## Phase 5 — Distribution

- [ ] **Publish the extension** to the VS Code Marketplace (needs a free Microsoft publisher account).
- [ ] **A landing page** explaining the deal to developers ("install, earn while your AI thinks").
- [ ] First **advertisers** — reach out to dev-tool companies (databases, APIs, AI tools) who want to reach developers.

## Phase 6 — Legal / trust (in parallel; before real money & scale)

- [ ] **Terms of Service + Privacy Policy** for both advertisers and developers. **Draft templates already exist** in `docs/legal/` (advertiser ToS, developer ToS, DPDP-aware privacy policy) — a lawyer must review/adapt before use; the app also already supports the data export/delete rights they promise.
- [ ] **A lawyer's read on the ad-injection** into third-party tools — this is the real risk area (likely violates those tools' Terms of Service). Mitigate with official integrations + the built-in killswitch. (See `ENGINEERING_HANDOFF.md` §13.7 and the conversation notes.)
- [ ] **FIRC / export-of-service** paperwork with your bank for foreign advertiser money.

---

## The 5-second version

1. Register the company + banking (GST, IEC).
2. Open Razorpay/RazorpayX + Stripe; do KYC; hand keys to engineering.
3. Deploy to a server in India (+ managed DB/Redis, domain, an email provider); run the seed script.
4. Build one real ad-injection adapter (Claude Code, via its official status line).
5. Publish the extension; get first advertisers.
6. Lawyer + ToS in parallel.

Everything else (the marketplace, money math, payouts, fraud controls, websites, CI/CD,
**and the production hardening — rate limits, health/readiness, graceful shutdown, password
reset & email verification, admin audit log, data export/delete, a slimmed deploy image**)
is already built and tested (**274 automated tests green**).
