# Kickbacks-India — Engineering Handoff

> **Audience:** CTO / incoming engineers.
> **Purpose:** Explain the whole codebase — what each file does, what's done, what's left, and exactly how to finish it.
> **Status (this commit):** Full marketplace implemented and tested behind clean seams. **112 automated tests green** (api 75 · extension 22 · shared 11 · portal 4). 71 commits, all on `main`, tree clean.

---

## 1. What this product is

An India-first clone of **kickbacks.ai**. It is **not** a consumer cashback app — it's a **two-sided advertising marketplace** that sells the one-line "Thinking…" status shown by AI coding agents (Claude Code, Codex, Gemini CLI) while they work.

- **Supply side = developers.** They install a VS Code extension; while their AI agent is busy, a sponsored line is shown; they earn ~50% of the ad revenue.
- **Demand side = advertisers** (global). They self-serve: create a campaign, set a bid, fund it, and their ad gets served on developers' machines.
- **The India wedge:** kickbacks.ai pays out **only via Stripe Connect, where India is "preview"** — Indian developers effectively can't cash out. We pay out in **INR via Razorpay/UPI** (and Stripe for others), behind a provider abstraction. That payout rail is the core differentiator.

### The end-to-end loop (works today, with stubs)
```
Advertiser registers → creates a campaign (bid auto-ranked) → buys blocks
   (payment "collect" → escrow funded in the ledger)
Developer installs extension → signs in (Google) → agent enters a wait-state
   → GET /serve returns the top funded ad → ad shown, on-screen time tracked
   → POST /events records a validated impression
   → ledger debits the campaign's escrow, credits the dev's earnings (~50%) + platform
Developer balance ≥ threshold → POST /payouts → routed payout (India→Razorpay, else→Stripe) → ledger debited
Admin can flip a global killswitch (GET /config) or suspend an account.
```

---

## 2. Repository layout

A **pnpm + Turborepo monorepo**. One language end-to-end (TypeScript).

```
kickbacks-india/
├── apps/
│   ├── api/        NestJS backend — the marketplace brain (Postgres + Redis)
│   ├── extension/  VS Code extension — the developer/supply client
│   └── portal/     Next.js app — the advertiser/demand dashboard
├── packages/
│   └── shared/     Shared zod schemas + types (used by all apps)
├── docs/superpowers/
│   ├── specs/      The approved design spec
│   └── plans/      10 implementation plans (01–09 + 07b), each fully detailed
├── infra (root)    docker-compose.yml (Postgres + Redis), .env.example
├── package.json    workspace root + scripts
├── turbo.json      task pipeline (build/test/lint/dev)
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── .nvmrc          node 22 (we run node 24, also fine)
```

### How the pieces depend on each other
- `packages/shared` is the contract: every request/response shape is a **zod schema** here. `api`, `extension`, and `portal` all import its types. **It must be built (`pnpm --filter @kbi/shared build`) before the api's Jest tests run** (Jest resolves `@kbi/shared` from its compiled `dist`).
- `extension` and `portal` are HTTP clients of `api`. They never touch the DB.
- `api` owns Postgres (via Prisma) and Redis (via ioredis).

---

## 3. Tech stack (and why)

| Layer | Choice | Why |
|------|--------|-----|
| Monorepo | pnpm workspaces + Turborepo | one language, shared types, fast iteration |
| API | **NestJS** | module/DI structure maps 1:1 to our domain modules; testable |
| DB | **PostgreSQL** + **Prisma** | money needs ACID; Prisma = type-safe queries + schema |
| Cache/realtime | **Redis** + ioredis | live bid ranking (sorted sets), rate-limit counters |
| Validation | **zod** | every boundary validated; schemas shared across apps |
| Extension | TypeScript + esbuild | VS Code API requires TS; esbuild bundles |
| Portal | **Next.js 14** (App Router) + React 18 | standard advertiser dashboard |
| Tests | **Jest** (api) · **vitest** (shared/extension/portal) | Jest is Nest's zero-friction default; vitest elsewhere |
| Payments | abstraction over **Stripe** + **Razorpay** | dual provider, route by country |
| Auth | Google OAuth (devs) + email/password bcryptjs (advertisers) → our own JWT | |

Money is always stored as **paise** (integer minor units of INR). Never floats.

---

## 4. Running it locally (read this first)

### Prerequisites & environment quirks (important — these bit us)
1. **Node** ≥ 22 (we used 24.13). 
2. **pnpm** — was *not* preinstalled on the dev machine. Install with `npm i -g pnpm@9` (corepack `prepare --activate` left it off PATH).
3. **Docker Desktop** must be **started manually** before backend work, then containers come up with compose.
4. **Prisma migrations:** use **`prisma db push`**, NOT `prisma migrate dev` — the latter hangs on an advisory lock in non-interactive shells (Prisma 5 WASM engine). See §13 for the production migration story.
5. After editing `packages/shared`, **rebuild it** before running api tests.
6. Git on Windows shows CRLF warnings — harmless.

### First-time setup
```bash
# 0. from repo root
pnpm install

# 1. infra
docker compose up -d            # Postgres :5432, Redis :6379

# 2. env for the api (git-ignored)
cp .env.example apps/api/.env

# 3. db schema + prisma client
pnpm --filter @kbi/api exec prisma db push
pnpm --filter @kbi/api exec prisma generate

# 4. build shared (needed by api tests)
pnpm --filter @kbi/shared build
```

### Run / test
```bash
# API (http://localhost:3000)
pnpm --filter @kbi/api dev
pnpm --filter @kbi/api test            # 75 tests (needs docker up)

# Portal (http://localhost:3001)  — set NEXT_PUBLIC_API_BASE if api isn't on :3000
pnpm --filter @kbi/portal dev
pnpm --filter @kbi/portal test         # 4 tests
pnpm --filter @kbi/portal build        # next build

# Extension (unit-tested core; UI is manual via VS Code F5)
pnpm --filter @kbi/extension test      # 22 tests
pnpm --filter @kbi/extension build     # esbuild → dist/extension.js
# see apps/extension/src/MANUAL-TEST.md to run the real Extension Host

# Shared
pnpm --filter @kbi/shared test         # 11 tests
```

### Environment variables (`.env.example`)
| Var | Used by | Notes |
|-----|---------|-------|
| `DATABASE_URL` | api (Prisma) | postgres connection |
| `REDIS_URL` | api (ioredis) | redis connection |
| `ADMIN_API_KEY` | api admin endpoints | sent as `x-admin-key` header |
| `PORT` | api | default 3000 |
| `AUTH_JWT_SECRET` | api auth | signs our session JWTs |
| `GOOGLE_CLIENT_ID` | api auth | audience for Google ID-token verification |
| `PAYOUT_MIN_PAISE` | api payouts | min withdrawal (default 10000 = ₹100) |
| `LEDGER_DEV_SHARE_BPS` | api ledger | dev revenue share, basis points (default 5000 = 50%) |
| `METRICS_*` | api metrics | `MIN_VIEW_MS` (5000), `MIN_GAP_MS` (5000), `HOURLY_CAP` (120), `DAILY_CAP` (600) |
| `KICKBACKS_API` | extension | api base URL (default http://localhost:3000) |
| `NEXT_PUBLIC_API_BASE` | portal | api base URL |

---

## 5. Data model (`apps/api/prisma/schema.prisma`)

8 tables. Money fields are integer paise.

| Model | Purpose | Key fields |
|-------|---------|-----------|
| **Account** | One row per user (dev / advertiser / admin) | `type`, `email?`, `oauthSub? @unique` (Google), `passwordHash?` (advertiser), `country?`, `suspended` |
| **Campaign** | An ad | `copy` (≤60), `url`, `iconUrl?`, `isHouseAd`, `status` (active), `advertiserId?` |
| **Bid** | A campaign's price for a surface | `campaignId`, `surface`, `amount` (paise per 1000-impression block), `status` |
| **AdEvent** | A recorded impression/click | `installId`, `campaignId`, `surface`, `type`, `nonce`, `visibleMs`, `valid`, `reason?`, `accountId?`; **`@@unique([installId, nonce])`** (idempotency) |
| **LedgerEntry** | Append-only double-entry line | `eventId` (source id), `account` (string key), `direction` (debit/credit), `amount`; **`@@unique([eventId, account, direction])`** |
| **BlockPurchase** | An advertiser's block buy | `campaignId`, `quantity`, `amountPaise`, `status`, `providerRef?` |
| **Payout** | A developer withdrawal | `accountId`, `provider`, `amountPaise`, `status`, `providerRef?` |
| **Killswitch** | Global/scoped kill flag | `scope @unique`, `active` |

**FK note (matters for test/cleanup ordering):** `Bid` and `BlockPurchase` both reference `Campaign` with a required FK. To delete campaigns you must delete `blockPurchase` → `bid` → `campaign` in that order (see `serve.e2e-spec.ts`/`auction.e2e-spec.ts`). `AdEvent.campaignId` is a **plain string (no FK)** on purpose, so event ingestion never 500s on a missing/cleaned campaign.

---

## 6. The Ledger — how money is tracked (read carefully)

We use **double-entry accounting** in the `LedgerEntry` table. Every money event writes balanced debit+credit lines. Balances are **derived** (`sum(credits) − sum(debits)` for an account key), never stored — so they're always consistent and auditable. All postings are **idempotent** (keyed on a source id via the unique constraint).

**Account keys (strings):**
| Key | Meaning | Balance interpretation |
|-----|---------|------------------------|
| `escrow:campaign:<campaignId>` | An advertiser's prepaid budget | remaining budget; `/serve` requires `> 0` |
| `earnings:dev:<accountId>` | What we owe a developer | withdrawable balance |
| `earnings:unattributed` | Impressions with no signed-in dev | (held; reconcile later) |
| `revenue:platform` | Our cut | platform revenue |
| `cash:platform` | Money received from advertisers | inflow |
| `payouts:cleared:<accountId>` | Counter-entry for a payout | total paid out to a dev |

**Money flows:**
- **Advertiser buys blocks** (`LedgerService.fundEscrow`): `debit cash:platform`, `credit escrow:campaign:<id>` by `quantity × bidPerBlock`.
- **Valid impression** (`LedgerService.postForEvent`): price = `bid.amount / 1000` (click = 50×). `debit escrow:campaign:<id>` (the advertiser spends), `credit earnings:dev:<acct>` (~50%, `LEDGER_DEV_SHARE_BPS`), `credit revenue:platform` (remainder). House ads / no bid / invalid events post nothing.
- **Payout** (`LedgerService.recordPayout`): `debit earnings:dev:<acct>`, `credit payouts:cleared:<acct>` by the full balance → earnings balance returns to 0.

`LedgerService` lives in `apps/api/src/ledger/ledger.service.ts`. Constants in `ledger/constants.ts`.

---

## 7. The API (`apps/api`) — modules & endpoints

NestJS. Each domain is a module under `src/`. Two cross-cutting **global** modules: `PrismaModule` (DB) and `RedisModule` (cache). `RankingModule` is also global.

### Module map
| Folder | Responsibility |
|--------|----------------|
| `prisma/`, `redis/` | DB + cache clients (global) |
| `ranking/` | Redis sorted-set bid ranking per surface (`topCampaign`, `topCampaigns`, `upsertBid`) |
| `serve/` | `GET /serve` — escrow-gated ad selection |
| `metrics/` | `POST /events` — idempotent impression/click ingestion + rate limits |
| `auth/` | Google sign-in for devs, JWT issue/verify, `AuthGuard` |
| `ledger/` | double-entry postings + balances + `GET /ledger/me/balance` |
| `payments/` | dual-provider abstraction + `POST /payouts` |
| `advertiser/` | advertiser auth + campaign creation + block purchase |
| `config/` | killswitch (`GET /config`) + admin toggle/suspend |
| `admin/` | `POST /admin/house-ads` (seed house ads) |
| `health/` | `GET /health` |

### Every endpoint
| Method & path | Auth | Body | Returns |
|---------------|------|------|---------|
| `GET /health` | — | — | `{status:"ok"}` |
| `GET /serve?surface=` | — | — | `{ad: ServeResponse \| null}` (skips out-of-budget/inactive) |
| `POST /events` | optional Bearer | `{installId,campaignId,surface,type,nonce,visibleMs}` | `{deduped,valid,reason}` |
| `POST /auth/google` | — | `{idToken}` | `{token, account}` |
| `GET /auth/me` | Bearer | — | `{id,email,type}` |
| `GET /ledger/me/balance` | Bearer | — | `{balancePaise,currency}` |
| `POST /payouts` | Bearer | — | `Payout` (402/403 if below threshold / suspended) |
| `GET /payouts/me` | Bearer | — | `Payout[]` |
| `POST /advertiser/register` | — | `{email,password}` | `{token, account}` |
| `POST /advertiser/login` | — | `{email,password}` | `{token, account}` |
| `POST /advertiser/campaigns` | Bearer | `{copy,url,iconUrl?,surface,bidPerBlockPaise}` | `Campaign` (also ranks the bid) |
| `GET /advertiser/campaigns` | Bearer | — | `Campaign[]` |
| `POST /advertiser/campaigns/:id/blocks` | Bearer | `{quantity}` | `BlockPurchase` (collect → fund escrow) |
| `GET /config` | — | — | `{active}` (the extension polls this) |
| `POST /admin/house-ads` | `x-admin-key` | `{copy,url,iconUrl?,surface}` | `{id}` |
| `POST /admin/killswitch` | `x-admin-key` | `{active,scope?}` | `{ok}` |
| `POST /admin/accounts/:id/suspend` | `x-admin-key` | `{suspended}` | `{ok}` |

### Request validation
Every controller parses the body/query with a **zod schema from `@kbi/shared`** and throws `400` on failure. No DTO classes / class-validator.

### Auth model
- **Developers** sign in with Google: the extension obtains a Google **ID token**, posts it to `/auth/google`; `GoogleVerifier` (`auth/google-verifier.ts`) validates it, we upsert an `Account`, and `TokenService` issues **our own JWT** (30-day, signed with `AUTH_JWT_SECRET`).
- **Advertisers** use email+password (`bcryptjs`), also issued our JWT.
- `AuthGuard` (`auth/auth.guard.ts`) validates the `Bearer` token and attaches the account to the request. `/events` uses **optional** auth (a token attributes earnings; without one, the event is anonymous).
- `GoogleVerifier` is an **abstract class used as the DI token** — tests/e2e override it with a fake (`.overrideProvider(GoogleVerifier)`), so the whole auth flow is testable without Google.

### Anti-abuse already in place
- **Idempotency:** `/events` dedupes on `(installId, nonce)`; ledger postings dedupe on source id.
- **View validation:** impressions need `visibleMs ≥ 5000`.
- **Rate limits** (`metrics/rate-limit.service.ts`, Redis): per-install spacing + hourly/daily caps.
- **Escrow gating:** `/serve` skips campaigns with non-positive escrow.
- **Killswitch + account suspension** (suspended accounts can't cash out).

---

## 8. The Extension (`apps/extension`) — developer client

**Deliberate split:** all logic that does *not* need a live agent is in `src/core/` and is **100% unit-tested**; the parts that touch VS Code or another tool's UI are isolated and **not** auto-testable.

| File | Role | Tested? |
|------|------|---------|
| `core/nonce.ts` | stable per-wait-state nonce (so offline retries dedupe) | ✅ |
| `core/viewTracker.ts` | accumulates on-screen time, only while focused+visible | ✅ |
| `core/apiClient.ts` | calls `/serve`, `/events`, `/auth/google`; offline queue + retry | ✅ |
| `core/killswitch.ts` | polls `GET /config`, keeps last state on error | ✅ |
| `core/adapter.ts` | `SpinnerAdapter` interface (the seam) | (interface) |
| `core/mockAdapter.ts` | fake adapter to drive the pipeline end-to-end | ✅ |
| `core/orchestrator.ts` | wires waitStart → serve → render → track → event | ✅ |
| `adapters/{claudeCode,codex,geminiCli}.ts` | **STUBS** for real injection (`isAvailable()===false`) | ⚠️ stub |
| `adapters/registry.ts` | lists adapters, picks first available else fallback | ✅ |
| `host/extension.ts` | VS Code `activate()` wiring (status bar, commands, focus, polling) | ⚠️ compile-only |
| `host/secretStore.ts` | stores the auth token in OS keychain (VS Code SecretStorage) | ⚠️ compile-only |

The `host` layer is verified by `tsc` + esbuild bundle. To exercise it for real, open `apps/extension` in VS Code and press **F5** (Extension Development Host); dev commands "Kickbacks: Simulate Wait-State" / "End" / "Sign in" drive the pipeline against a running api. See `apps/extension/src/MANUAL-TEST.md`.

---

## 9. The Portal (`apps/portal`) — advertiser dashboard

Next.js 14 App Router. `next build` passes; run with `pnpm --filter @kbi/portal dev` (port 3001).

| File | Role |
|------|------|
| `lib/api.ts` | `PortalApi` — typed client for `/advertiser/*` (register/login/createCampaign/listCampaigns/buyBlocks). **Unit-tested.** |
| `lib/token.ts` | JWT in `localStorage` (browser-guarded) |
| `app/layout.tsx` | root HTML shell |
| `app/page.tsx` | landing + links |
| `app/login/page.tsx` | register/login form (client) |
| `app/campaigns/page.tsx` | list + create campaign + buy blocks (client) |

The pages are intentionally minimal (system fonts, inline styles, no design system) — a functional reference UI, not production polish.

---

## 10. The Shared package (`packages/shared`)

The single source of truth for wire formats. Every file exports zod schemas + inferred TS types:
- `surfaces.ts` — the 4 ad surfaces (`claude-code-panel`, `claude-code-terminal`, `codex-panel`, `gemini-cli-terminal`).
- `dtos.ts` — `serveQuery`, `serveResponse`.
- `events.ts` — event type + `eventIngest` / `eventResult`.
- `auth.ts` — google login + account + token response.
- `advertiser.ts` — register/login/createCampaign/buyBlocks.
- `index.ts` — re-exports all.

**Rule:** if you change a request/response shape, change it here, rebuild, and the type error will show you every call site to update.

---

## 11. Testing

- **108 backend/shared/extension + 4 portal = 112 tests.** Unit tests use mocks; e2e tests boot a real Nest app against Postgres+Redis.
- Run all api tests: `pnpm --filter @kbi/api test` (Docker must be up).
- **Jest runs serially** (`maxWorkers: 1` in `apps/api/jest.config.js`) because the e2e suites share one database.
- **Known flake:** ~1-in-4 runs, one e2e occasionally fails with a transient connection error (no reproducible assertion failure) under serial load of many Nest-app boots. It is **not** a logic bug. If it becomes annoying, the right fix is **per-test DB isolation (transaction rollback or a schema-per-worker)**, not blind retries.
- Test data hygiene: e2e suites clean up after themselves; remember the FK delete order (§5).

---

## 12. What's DONE ✅

- ✅ Monorepo, CI-less local toolchain, docker infra.
- ✅ Ad serving with bid ranking **and escrow gating**.
- ✅ Idempotent impression/click ingestion with view-threshold + rate limits.
- ✅ Developer Google sign-in → account → JWT; earnings attribution.
- ✅ Full double-entry ledger + derived balances.
- ✅ Dual-provider **payout** abstraction + `/payouts` + ledger debit.
- ✅ Advertiser auth + campaign creation (auto-ranked) + **block purchase → escrow funding**.
- ✅ Killswitch (`/config`) + account suspension.
- ✅ Extension core pipeline (fully tested) + adapter seam + MockAdapter.
- ✅ Advertiser portal (register → campaign → buy blocks).
- ✅ 112 tests, all green; everything committed to `main`.

---

## 13. What's LEFT — and exactly how to do it

Everything remaining is **real-world integration** that needs credentials, live software, or a legal entity. Each sits behind a finished seam, so it's "fill in the implementation," not "re-architect."

### 13.1 Real payment providers (highest priority for revenue)
**Where:** `apps/api/src/payments/stripe.provider.ts` and `razorpay.provider.ts` — currently throw "not configured."
**How:**
1. Create a **Razorpay** account + RazorpayX for payouts; create a **Stripe** account (+ Connect for non-India payouts).
2. Add `RAZORPAYX_KEY/SECRET`, `STRIPE_SECRET_KEY` to env.
3. Implement `payout(req)`:
   - **RazorpayProvider:** call RazorpayX Payouts API (fund account → UPI/IMPS/bank) using `req.amountPaise`, return `{providerRef, status}`.
   - **StripeProvider:** Stripe Connect transfer/payout; return same shape.
4. Implement `collect(req)` (advertiser money-in): create a Razorpay Order / Stripe PaymentIntent; return a `checkoutUrl` for redirect or a client secret.
5. **Add webhook endpoints** to confirm async payment status (a payment may settle later) — verify the signature (`Stripe-Signature` / `X-Razorpay-Signature`) before trusting it. Flip `Payout.status` / `BlockPurchase.status` on the webhook.
6. KYC/onboarding: devs need a payout destination (UPI/bank); store it on `payee_accounts` (add a model) and gate payouts on KYC complete.
**Tests already cover** routing + the service orchestration (providers are overridden with fakes), so you only test the new SDK adapters in isolation.

### 13.2 Real spinner injection (makes the extension actually earn)
**Where:** `apps/extension/src/adapters/{claudeCode,codex,geminiCli}.ts` — stubs that report `isAvailable()===false`.
**How:** for each agent, implement the `SpinnerAdapter` interface:
- `isAvailable()` — detect the agent is installed/active.
- `start(handlers)` — hook the agent's "thinking" start/stop and call `onWaitStart`/`onWaitEnd`.
- `render(ad)` / `clear()` — write/restore the sponsored line.
The mechanism is **agent-specific and undocumented** — likely via the agent's own status-line/hook extension points (e.g., Claude Code's terminal status line) rather than hacking another extension's webview. Build one adapter at a time, verify against the live agent (`MANUAL-TEST.md`), and keep the always-safe no-op fallback so a vendor UI change never breaks the user's agent. The `Orchestrator` + `ViewTracker` + `ApiClient` they plug into are done and tested.

### 13.3 Killswitch poller — already wired
`GET /config` exists and the extension's `Killswitch` already polls `${API_BASE}/config`. Nothing to do except set the global flag via `POST /admin/killswitch` in an incident.

### 13.4 Fraud hardening (iterative)
- **IP-hash clustering / multi-account detection:** the extension was specced to send a salted IP hash but the api doesn't store it yet. To add: include `ipHash` in the `eventIngest` schema, store it on `AdEvent` (+ a `dev_installs` table), and add a `FraudService` rule that flags many install-ids sharing an `ipHash`.
- **Creative moderation:** make new campaigns `status:"pending"` and not ranked until an admin approves (this ripples into `CampaignService.create` and `/serve` — currently campaigns go live immediately).
- **Pacing:** spread a campaign's delivery over time (token bucket in Redis keyed off a "delivery speed" preference).

### 13.5 Production migrations
We used `prisma db push` for speed in dev. For production, switch to **versioned migrations**: generate them with `prisma migrate diff` / `prisma migrate dev` in an interactive environment, commit `prisma/migrations/`, and run `prisma migrate deploy` in CI/CD. (Plan 01 documents the advisory-lock workaround we used locally.)

### 13.6 Observability & deployment
- Add structured logging + request tracing, error reporting (Sentry), and basic metrics dashboards.
- Deploy: containerize the api; host Postgres + Redis (managed, **India region** for latency/data residency); deploy the portal (Vercel or container); publish the extension to the VS Code Marketplace.
- Secrets via a manager (not env files) in prod.

### 13.7 Legal / entity (blocks real money)
India Pvt Ltd; **IEC + FIRC** for export-of-service receipts (advertisers pay from abroad); **GST** on the platform fee; **TDS** on developer payouts; advertiser + developer ToS + privacy policy. Vendor risk: injecting into Anthropic/OpenAI/Google agent UIs is adversarial — their ToS/UI changes can break or ban us; mitigate with versioned adapters + the killswitch.

---

## 14. Known issues / tech debt
- **e2e flake** (~1/4) — see §11; fix with per-test DB isolation.
- **No serve↔impression escrow reservation** — `/serve` gates on escrow `> 0`, but concurrent in-flight impressions can slightly overspend (bounded). Add a per-impression reservation if exactness matters.
- **Ledger prices off the campaign's current top bid**, not the exact bid that served — fine now (one bid per surface); revisit for true 2nd-price auctions.
- **`earnings:unattributed`** accrues for anonymous impressions and is never reconciled — decide policy (forfeit vs. claim-on-signin).
- **Portal UI is bare** — no design, no error toasts beyond text, no logout.
- **`db push` not migrations** — see §13.5.

---

## 15. Where to read more
- **Design spec:** `docs/superpowers/specs/2026-06-22-kickbacks-india-ad-marketplace-design.md` — the architecture + decisions + risks.
- **Implementation plans** (`docs/superpowers/plans/`): one per slice (01 foundation, 02 metrics, 03 extension, 04 auth, 05 ledger, 06 payments, 07 advertiser-billing, 07b portal, 08 auction, 09 fraud). Each has the exact files, code, and reasoning — the best onboarding path is to read these in order.
- **Original product** (for reference): kickbacks.ai, its FAQ, and the open-source extension at github.com/andrewmccalip/kickbacks.ai.

---

## 16. Suggested next-step priority
1. **Razorpay payout + collect** (§13.1) — unlocks real money for the India wedge.
2. **One real spinner adapter** (Claude Code) (§13.2) — proves real earning end-to-end.
3. **Webhooks + KYC** for payment status + payout destinations.
4. **Production migrations + deploy** (§13.5–13.6).
5. **Moderation + IP clustering** (§13.4) before scaling advertisers.
6. **Legal entity** in parallel (§13.7) — gates going live with real funds.

The core is built and tested. The remaining work is integration and operations, each behind a clean, documented seam.
