# Kickbacks-India — Engineering Handoff

> **Audience:** CTO / incoming engineers.
> **Purpose:** Explain the whole codebase — what each file does, what's done, what's left, and exactly how to finish it.
> **Status (this commit):** Full marketplace implemented and tested behind clean seams, plus hardening batches. **Repo:** github.com/Rohanxmalik/vibe-earning.ai (`main`). **239 automated tests green** (api 165 · extension 44 · shared 17 · portal 13) + 3 Playwright browser smokes (run separately). Tree clean.
>
> **Batch 1 (marked [NEW] inline):** campaign analytics · creative moderation (pending→admin-approve) · IP-hash clustering · real Stripe/Razorpay SDK adapters + HMAC-verified webhooks · GitHub Actions CI · versioned Prisma baseline · Dockerfiles · helmet/CORS/exception-filter/pino · e2e flake fixed.
>
> **Batch 2 (marked [NEW2] inline):** completed the **payout loop** (RazorpayX payout adapter + `PayoutDestination` KYC model + payout webhooks) · delivery **pacing** + global **rate-limiting** + escrow **overspend guard** · **developer earnings dashboard** + **admin operations console** in the portal · root `README` · prod `docker-compose` · **CD** workflow (GHCR images) · **Sentry** (DSN-guarded) · **Playwright** portal smokes. Two more zero-drift migrations.
>
> **Batch 3 (marked [NEW3] inline):** **top-N ad rotation** — `/serve?count=N` returns the top-N eligible ads; the extension rotates through them as the spinner ticks (`adapter.onTick`), holding each ~5s of *visible* time and billing each ad as its own impression. Short waits show one ad; long sessions reach #2/#3. The real spinner adapters still need to fire `onTick` (deferred with injection).
>
> **Batch 4 (marked [NEW4] inline):** safety + onboarding + UX — fraud-cluster void (`/admin/fraud/void-cluster`) · serve affordability skip · **admin email/password login** (`/admin/login`) · **second-price auction** pricing · advertiser **pause/resume/top-up/edit** · **developer web onboarding** (email/password `/dev/register` + `/dev/login` — no extension needed) · **portal design system** (clean minimal UI: nav, hero, cards, tabs, badges, alerts) restyling all pages · admin portal **wired to `/admin/login`** (static `x-admin-key` dropped from the web) · **unattributed earnings forfeited to platform** (no more limbo bucket) · **atomic escrow reservation** (per-campaign advisory lock prevents concurrent overspend).

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
4. **Prisma migrations:** there is now a **versioned baseline migration** (`apps/api/prisma/migrations/20260623000000_init`). Production/CI use **`prisma migrate deploy`** (in CI and the Docker entrypoint). For quick local schema iteration `prisma db push` still works; avoid `prisma migrate dev` — it hangs on an advisory lock in non-interactive shells (Prisma 5 WASM engine). To add a migration, generate the delta SQL with `prisma migrate diff` against a shadow DB (lock-free). **[NEW]**
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
pnpm --filter @kbi/api test            # 111 tests (needs docker up)

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
| `STRIPE_SECRET_KEY` | api payments | **[NEW]** real Stripe SDK; unset ⇒ adapter throws `stripe_not_configured` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | api payments | **[NEW]** real Razorpay SDK; unset ⇒ adapter throws `razorpay_not_configured` |
| `RAZORPAYX_ACCOUNT_NUMBER` | api payouts | **[NEW2]** RazorpayX virtual account that funds payouts; unset ⇒ `razorpayx_not_configured` |
| `RAZORPAY_WEBHOOK_SECRET` / `STRIPE_WEBHOOK_SECRET` | api webhooks | **[NEW]** HMAC verification of inbound PSP webhooks (dev defaults provided) |
| `FRAUD_IP_SALT` / `FRAUD_IP_MAX_INSTALLS` (5) / `FRAUD_IP_WINDOW_SEC` (3600) | api fraud | **[NEW]** IP-hash clustering knobs |
| `THROTTLE_LIMIT` | api | **[NEW2]** per-IP requests/min (default 300; tests set 1000000) |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | api | **[NEW2]** error reporting; unset ⇒ Sentry disabled (no-op) |
| `CORS_ORIGINS` | api | **[NEW]** comma-separated allowlist; unset reflects request origin (dev) |
| `LOG_LEVEL` | api | **[NEW]** pino level; tests force `silent` |
| `KICKBACKS_API` | extension | api base URL (default http://localhost:3000) |
| `NEXT_PUBLIC_API_BASE` | portal | api base URL (build-time inlined) |
| `NEXT_OUTPUT` | portal build | **[NEW]** set to `standalone` for the Docker build (off by default so Windows builds work) |

---

## 5. Data model (`apps/api/prisma/schema.prisma`)

9 tables. Money fields are integer paise.

| Model | Purpose | Key fields |
|-------|---------|-----------|
| **Account** | One row per user (dev / advertiser / admin) | `type`, `email?`, `oauthSub? @unique` (Google), `passwordHash?` (advertiser), `country?`, `suspended` |
| **Campaign** | An ad | `copy` (≤60), `url`, `iconUrl?`, `isHouseAd`, `status` (**advertiser campaigns start `pending`; house ads `active`** — see moderation §7), **`pacePerMinute?`** (delivery cap, **[NEW2]**), `advertiserId?` |
| **Bid** | A campaign's price for a surface | `campaignId`, `surface`, `amount` (paise per 1000-impression block), `status` |
| **AdEvent** | A recorded impression/click | `installId`, `campaignId`, `surface`, `type`, `nonce`, `visibleMs`, `valid`, `reason?` (incl. `ip_cluster`), **`ipHash?`** (server-derived salted hash, **[NEW]**), `accountId?`; **`@@unique([installId, nonce])`** (idempotency) |
| **LedgerEntry** | Append-only double-entry line | `eventId` (source id), `account` (string key), `direction` (debit/credit), `amount`; **`@@unique([eventId, account, direction])`** |
| **BlockPurchase** | An advertiser's block buy | `campaignId`, `quantity`, `amountPaise`, `status`, `providerRef?` |
| **Payout** | A developer withdrawal | `accountId`, `provider`, `amountPaise`, `status`, `providerRef?` |
| **PayoutDestination** **[NEW2]** | A dev's UPI/bank cash-out target | `accountId`, `method` (upi/bank), `vpa?`, `accountNumber?`, `ifsc?`, `status` (pending/verified/rejected), `providerRef?` (RazorpayX fund_account) |
| **Killswitch** | Global/scoped kill flag | `scope @unique`, `active` |

**FK note (matters for test/cleanup ordering):** `Bid` and `BlockPurchase` reference `Campaign`; `Payout` and `PayoutDestination` reference `Account` — all required FKs. The Jest `globalSetup` truncates in FK-safe order (`ledgerEntry → adEvent → blockPurchase → bid → payout → payoutDestination → campaign → account → killswitch`). `AdEvent.campaignId` is a **plain string (no FK)** on purpose, so event ingestion never 500s on a missing/cleaned campaign.

---

## 6. The Ledger — how money is tracked (read carefully)

We use **double-entry accounting** in the `LedgerEntry` table. Every money event writes balanced debit+credit lines. Balances are **derived** (`sum(credits) − sum(debits)` for an account key), never stored — so they're always consistent and auditable. All postings are **idempotent** (keyed on a source id via the unique constraint).

**Account keys (strings):**
| Key | Meaning | Balance interpretation |
|-----|---------|------------------------|
| `escrow:campaign:<campaignId>` | An advertiser's prepaid budget | remaining budget; `/serve` requires `> 0` |
| `earnings:dev:<accountId>` | What we owe a developer | withdrawable balance |
| `earnings:unattributed` | _(legacy — no longer written)_ | anonymous impressions now forfeit the dev share to `revenue:platform` **[NEW4]** |
| `revenue:platform` | Our cut | platform revenue |
| `cash:platform` | Money received from advertisers | inflow |
| `payouts:cleared:<accountId>` | Counter-entry for a payout | total paid out to a dev |

**Money flows:**
- **Advertiser buys blocks** (`LedgerService.fundEscrow`): `debit cash:platform`, `credit escrow:campaign:<id>` by `quantity × bidPerBlock`.
- **Valid impression** (`LedgerService.postForEvent`): price = `bid.amount / 1000` (click = 50×). `debit escrow:campaign:<id>` (the advertiser spends), `credit earnings:dev:<acct>` (~50%, `LEDGER_DEV_SHARE_BPS`), `credit revenue:platform` (remainder). **Anonymous impressions (no signed-in dev) forfeit the dev share — the full price goes to `revenue:platform` [NEW4].** House ads / no bid / invalid events post nothing. The whole posting runs inside a **per-campaign advisory-lock transaction** (re-check escrow → write) so concurrent impressions can't overspend the budget **[NEW4]**.
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
| `serve/` | `GET /serve` — escrow-gated ad selection (only `active`, ranked campaigns) + **per-campaign pacing** (`pacing.service.ts`, **[NEW2]**) |
| `metrics/` | `POST /events` — idempotent ingestion + rate limits + **IP-hash clustering** (`fraud.service.ts`, `ip.ts`) **[NEW]** |
| `auth/` | Google sign-in for devs, JWT issue/verify, `AuthGuard` |
| `ledger/` | double-entry postings + balances + `GET /ledger/me/balance` + **`GET /ledger/me/summary`** **[NEW]** + **no-overspend guard** **[NEW2]** |
| `payments/` | dual-provider abstraction + `POST /payouts` + **real SDK adapters** + **HMAC-verified webhooks** + **RazorpayX payout + `PayoutDestination` KYC** (`payout-destination.service.ts`) **[NEW2]** |
| `advertiser/` | advertiser auth + campaign creation + block purchase + **`campaign-stats.service.ts`** **[NEW]** |
| `config/` | killswitch (`GET /config`) + admin toggle/suspend + **campaign approve, destination verify, pending lists** **[NEW2]** |
| `admin/` | `POST /admin/house-ads` (seed house ads) |
| `common/` | `AllExceptionsFilter` (sanitized errors) + `configureApp` (helmet+CORS) + **`sentry.ts`** (DSN-guarded) **[NEW]/[NEW2]** |
| `health/` | `GET /health` |
| _global_ | **`@nestjs/throttler`** per-IP rate-limit guard (`THROTTLE_LIMIT`/min) **[NEW2]** |

### Every endpoint
| Method & path | Auth | Body | Returns |
|---------------|------|------|---------|
| `GET /health` | — | — | `{status:"ok"}` |
| `GET /serve?surface=&count=` | — | — | `{ad, ads}` — `ads` = top-N eligible (count 1–3, default 1) for in-spinner rotation; `ad` mirrors `ads[0]` for back-compat **[NEW3]** |
| `POST /events` | optional Bearer | `{installId,campaignId,surface,type,nonce,visibleMs}` | `{deduped,valid,reason}` |
| `POST /auth/google` | — | `{idToken}` | `{token, account}` |
| `GET /auth/me` | Bearer | — | `{id,email,type}` |
| `GET /ledger/me/balance` | Bearer | — | `{balancePaise,currency}` |
| `GET /ledger/me/summary` **[NEW]** | Bearer | — | `{balancePaise,currency,validImpressions}` |
| `POST /payouts` | Bearer | — | `Payout` (402/403 if below threshold / suspended) |
| `GET /payouts/me` | Bearer | — | `Payout[]` |
| `POST /payouts/destination` **[NEW2]** | Bearer | `{method,vpa?\|accountNumber+ifsc}` | `PayoutDestination` (pending) |
| `GET /payouts/destination` **[NEW2]** | Bearer | — | `PayoutDestination[]` |
| `POST /advertiser/register` | — | `{email,password}` | `{token, account}` |
| `POST /advertiser/login` | — | `{email,password}` | `{token, account}` |
| `POST /dev/register` **[NEW4]** | — | `{email,password}` | `{token, account}` — developer web onboarding (type `dev`, no extension needed) |
| `POST /dev/login` **[NEW4]** | — | `{email,password}` | `{token, account}` |
| `POST /advertiser/campaigns` | Bearer | `{copy,url,iconUrl?,surface,bidPerBlockPaise,pacePerMinute?}` | `Campaign` (**created `pending`, NOT ranked until approved**) |
| `GET /advertiser/campaigns` | Bearer | — | `Campaign[]` |
| `PATCH /advertiser/campaigns/:id` **[NEW4]** | Bearer (owner) | `{copy?,url?,iconUrl?,bidPerBlockPaise?}` | `Campaign` — edit; creative change on a live campaign → back to `pending` + unranked (re-moderation); bid change re-ranks |
| `GET /advertiser/campaigns/:id/stats` **[NEW]** | Bearer (owner) | — | `{impressions,clicks,spendPaise,escrowRemainingPaise}` |
| `POST /advertiser/campaigns/:id/blocks` | Bearer | `{quantity}` | `BlockPurchase` (collect → fund escrow) |
| `POST /webhooks/razorpay` **[NEW]** | `x-razorpay-signature` (HMAC) | PSP event | `{ok}` — verifies sig vs raw body, reconciles purchase → paid + funds escrow |
| `POST /webhooks/stripe` **[NEW]** | `stripe-signature` (HMAC) | PSP event | `{ok}` — same as above |
| `GET /config` | — | — | `{active}` (the extension polls this) |
| `POST /admin/house-ads` | `x-admin-key` | `{copy,url,iconUrl?,surface}` | `{id}` |
| `GET /admin/campaigns/pending` **[NEW2]** | `x-admin-key` | — | `Campaign[]` (moderation queue) |
| `POST /admin/campaigns/:id/approve` **[NEW]** | `x-admin-key` | — | `{ok}` — moderates a pending campaign live + ranks its bids |
| `GET /admin/payout-destinations/pending` **[NEW2]** | `x-admin-key` | — | `PayoutDestination[]` (KYC queue) |
| `POST /admin/payout-destinations/:id/verify` **[NEW2]** | `x-admin-key` | `{providerRef?}` | `{ok}` — KYC-verify a destination |
| `POST /admin/fraud/void-cluster` **[NEW4]** | admin | `{ipHash}` | `{voided}` — claw back a confirmed fraud cluster |
| `POST /admin/login` **[NEW4]** | — | `{email,password}` | `{token, account}` — admin JWT (alt to the static key) |
| `POST /admin/killswitch` | admin | `{active,scope?}` | `{ok}` |
| `POST /admin/accounts/:id/suspend` | admin | `{suspended}` | `{ok}` |

> **[NEW4]** "admin" auth = **either** the static `x-admin-key` header **or** a Bearer token from `POST /admin/login` (an `Account` of `type:"admin"`).

### Request validation
Every controller parses the body/query with a **zod schema from `@kbi/shared`** and throws `400` on failure. No DTO classes / class-validator.

### Auth model
- **Developers** sign in with Google (extension): the extension obtains a Google **ID token**, posts it to `/auth/google`; `GoogleVerifier` (`auth/google-verifier.ts`) validates it, we upsert an `Account`, and `TokenService` issues **our own JWT** (30-day, signed with `AUTH_JWT_SECRET`). **[NEW4]** Developers can **also** onboard on the web with email+password (`/dev/register`, `/dev/login`, `DevAuthService`, type `dev`) — they paste the issued token into the extension to attribute earnings.
- **Advertisers** use email+password (`bcryptjs`), also issued our JWT.
- **Admins** use email+password (`/admin/login`) → JWT for `type:"admin"` accounts; admin endpoints accept that Bearer token (or the legacy static `x-admin-key`). **[NEW4]**
- `AuthGuard` (`auth/auth.guard.ts`) validates the `Bearer` token and attaches the account to the request. `/events` uses **optional** auth (a token attributes earnings; without one, the event is anonymous).
- `GoogleVerifier` is an **abstract class used as the DI token** — tests/e2e override it with a fake (`.overrideProvider(GoogleVerifier)`), so the whole auth flow is testable without Google.

### Anti-abuse already in place
- **Idempotency:** `/events` dedupes on `(installId, nonce)`; ledger postings dedupe on source id.
- **View validation:** impressions need `visibleMs ≥ 5000`.
- **Rate limits** (`metrics/rate-limit.service.ts`, Redis): per-install spacing + hourly/daily caps.
- **IP-hash clustering [NEW]** (`metrics/fraud.service.ts`): the server salts+hashes the source IP (never stores raw IPs) and tracks distinct installs per IP in a rolling Redis window; once `> FRAUD_IP_MAX_INSTALLS` (default 5) share one IP, further events are flagged `ip_cluster` and earn nothing. Takes precedence over view/cap checks; applies to clicks too.
- **Creative moderation [NEW]:** advertiser campaigns are created `pending` and are not ranked (so never serve) until an admin calls `POST /admin/campaigns/:id/approve`, which flips them `active` and ranks their bids. House ads bypass this.
- **Escrow gating:** `/serve` skips campaigns with non-positive escrow; **the ledger also refuses to post when escrow < price** so concurrent impressions can't drive escrow negative ([NEW2]).
- **Delivery pacing [NEW2]:** `/serve` skips a funded campaign that has hit its `pacePerMinute` cap (Redis per-minute counter).
- **Global rate limiting [NEW2]:** `@nestjs/throttler` caps requests per IP per minute (`THROTTLE_LIMIT`, default 300).
- **Payout safety [NEW2]:** cash-out requires a **verified** `PayoutDestination`; the ledger is debited only when a payout settles (`paid`), with async `pending` payouts settled by webhook.
- **Killswitch + account suspension** (suspended accounts can't cash out).
- **Webhook signature verification [NEW]:** inbound PSP webhooks are HMAC-verified against the raw request body before any state change.
- **Sanitized errors [NEW]:** a global exception filter prevents stack traces / internal messages (e.g. PSP `not_configured` detail) from leaking to clients; 500s reported to Sentry when `SENTRY_DSN` is set.

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

## 9. The Portal (`apps/portal`) — advertiser + developer + admin web

Next.js 14 App Router. `next build` passes; run with `pnpm --filter @kbi/portal dev` (port 3001).

| File | Role |
|------|------|
| `app/globals.css` **[NEW4]** | **Design system** — CSS-variable palette (indigo accent, emerald money, zinc neutrals) + components (nav, hero, card, btn, input/field, badge, tab, alert, list, stat). Zero new deps; refined system-font stack (no web-font fetch, so Docker/CI builds stay network-free). |
| `lib/api.ts` | `PortalApi` — typed client for advertiser, **developer** and **admin** endpoints. **Unit-tested (13).** |
| `lib/token.ts` | advertiser JWT + **dev token** + **admin JWT** (`/admin/login`) in `localStorage` (browser-guarded) |
| `app/layout.tsx` **[NEW4]** | imports `globals.css`; sticky nav (Advertisers / Developers / Admin) + footer |
| `app/page.tsx` | hero landing + onboarding cards (advertiser / developer / admin) |
| `app/login/page.tsx` | advertiser **tabbed** register/login |
| `app/campaigns/page.tsx` | list + create + buy blocks + pause/resume + **inline edit** **[NEW4]** + log out |
| `app/earnings/page.tsx` | developer view: **email/password sign up + log in** (extension-token as fallback) **[NEW4]**, balance/impressions, UPI destination, cash out |
| `app/admin/page.tsx` | ops console: **admin email/password login** **[NEW4]**, approve pending campaigns, KYC-verify destinations, killswitch |
| `e2e/smoke.spec.ts` **[NEW2]** | Playwright smokes for `/`, `/earnings`, `/admin` (opt-in `test:e2e`, not in CI vitest) |

The portal now has a **clean, minimal design system** (`globals.css`) — indigo accent on a zinc canvas, consistent cards/buttons/forms across all pages. Developers and advertisers can onboard entirely on the web.

---

## 10. The Shared package (`packages/shared`)

The single source of truth for wire formats. Every file exports zod schemas + inferred TS types:
- `surfaces.ts` — the 4 ad surfaces (`claude-code-panel`, `claude-code-terminal`, `codex-panel`, `gemini-cli-terminal`).
- `dtos.ts` — `serveQuery`, `serveResponse`.
- `events.ts` — event type + `eventIngest` / `eventResult`.
- `auth.ts` — google login + account + token response.
- `advertiser.ts` — register/login/createCampaign (+ `pacePerMinute`)/buyBlocks.
- `payouts.ts` **[NEW2]** — `payoutDestinationSchema` (UPI/bank).
- `index.ts` — re-exports all.

**Rule:** if you change a request/response shape, change it here, rebuild, and the type error will show you every call site to update.

---

## 11. Testing

- **api 165 · extension 44 · shared 17 · portal 13 = 239 tests**, plus **3 Playwright** browser smokes (`pnpm --filter @kbi/portal test:e2e`, opt-in — needs `npx playwright install chromium`; kept out of the default vitest/CI run). Unit tests use mocks; e2e tests boot a real Nest app against Postgres+Redis.
- Run all api tests: `pnpm --filter @kbi/api test` (Docker must be up).
- **Jest runs serially** (`maxWorkers: 1` in `apps/api/jest.config.js`) because the e2e suites share one database, and a **`globalSetup`** (`apps/api/jest.global-setup.js`) truncates all tables + flushes Redis once per run for a pristine cross-run baseline. **[NEW]**
- **The old "~1/4 e2e flake" is FIXED [NEW]** — it was not transient infra. Root cause: every e2e request comes from the loopback IP, so the new IP-cluster Redis set is **shared across spec files**; `metrics.e2e`'s cluster test leaves >5 installs in it, and if it ran before `ledger.e2e` (which needs its impression to be *valid*) the impression got flagged `ip_cluster` and posted zero ledger entries — failing depending on Jest's file order. Fix: `ledger.e2e` flushes Redis in `beforeAll`; `auction.e2e` uses its own ranking surface; the globalSetup gives a clean slate. **Verified 8/8 consecutive full-suite runs green.**
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

**Post-launch hardening batch [NEW]:**
- ✅ Campaign analytics (`/advertiser/campaigns/:id/stats`) + dev earnings summary (`/ledger/me/summary`).
- ✅ Creative moderation: campaigns `pending` → admin approve → ranked/active.
- ✅ IP-hash clustering fraud signal (salted, windowed, Redis-backed).
- ✅ **Real Stripe + Razorpay SDK adapters** behind a configured-or-throw client seam (Stripe collect+payout; Razorpay collect; RazorpayX payout still TODO).
- ✅ **HMAC-verified payment webhooks** (`/webhooks/{stripe,razorpay}`) → reconcile purchase to paid + idempotently fund escrow.
- ✅ GitHub Actions CI (Postgres+Redis services, lint/test/build) + **versioned Prisma baseline migration** (verified zero-drift) + **API & portal Dockerfiles** (API image builds clean).
- ✅ Security pass: helmet, CORS, global sanitizing exception filter, pino structured logging with secret redaction.
- ✅ e2e flake **root-caused and fixed** (8/8 runs green).

**Second batch [NEW2]:**
- ✅ **Payout loop complete** — RazorpayX payout adapter (REST seam) + `PayoutDestination` KYC model + dev/admin destination endpoints + payout webhooks (settle/fail). Ledger debited only on settlement.
- ✅ **Delivery pacing** (`pacePerMinute`), **global rate limiting** (`@nestjs/throttler`), **escrow overspend guard** in the ledger.
- ✅ **Developer earnings dashboard** + **admin operations console** in the portal (approve campaigns, KYC-verify destinations, killswitch).
- ✅ **README**, **prod `docker-compose`**, **CD** (GHCR images), **Sentry** (DSN-guarded), **Playwright** portal smokes.
- ✅ Pushed to **github.com/Rohanxmalik/vibe-earning.ai**.
- ✅ **173 tests + 3 Playwright, all green**; everything on `main`.

---

## 13. What's LEFT — and exactly how to do it

Each sits behind a finished seam, so it's "fill in the implementation / plug in credentials," not "re-architect."

### 13.1 Real payment providers — **code-complete [NEW2]**; only live credentials remain
**Done:** `stripe.provider.ts` / `razorpay.provider.ts` wrap the **real SDKs** behind a lazy `client()` seam (`setClient()`/`setHttp()` inject fakes in unit tests; unset creds ⇒ clear `*_not_configured` throw). Stripe `collect` (PaymentIntent) + `payout` (Connect transfer), Razorpay `collect` (Order), and **RazorpayX `payout`** (real `/v1/payouts` REST) are implemented. **Webhooks** verify HMAC vs the raw body and reconcile both **collections** (`BlockPurchase` → paid + idempotent escrow) and **payouts** (`payout.processed`→settle+`recordPayout`, `payout.failed/reversed`→failed). **KYC:** `PayoutDestination` model + dev endpoints + admin verify; `/payouts` gates on a verified destination. Unit + e2e cover mapping, signature verification, and reconciliation.
**Still to do (external only):** create real Stripe + Razorpay + RazorpayX accounts, complete RazorpayX KYC/contact+fund_account onboarding (store the `fund_account_id` on `PayoutDestination.providerRef` at verify time), and set the live keys/secrets in env (§4). No more code changes needed to go live on the happy path.

### 13.2 Real spinner injection (makes the extension actually earn)
**Where:** `apps/extension/src/adapters/{claudeCode,codex,geminiCli}.ts` — stubs that report `isAvailable()===false`.
**How:** the recommended path is each agent's **official** status-line/hook extension point, not hacking a webview. **Claude Code has a working prototype + guide: `docs/extension/claude-code-statusline.md`** — a standalone status-line script (`src/statusline/cli.ts` → `dist/statusline.js`) with three unit-tested pure modules: `compose.ts` (line text; "Sponsored" label, house ads exempt), `billing.ts` (**conservative** rule — at most one impression per shown ad-window, only after the 5s view threshold, stable nonce so refreshes dedupe; never over-bills), and `store.ts` (reads the dev token from `KICKBACKS_TOKEN`/`~/.kickbacks/token` and persists window state). It **attributes** earnings by sending the dev's bearer token on `/serve` + `/events`, and **rotates** the top-3 ads (`tickRotation`, unit-tested — holds each ~8s, cycles). What remains for Claude Code: **live verification** on a real install. Alternatively/additionally, implement the `SpinnerAdapter` interface (`isAvailable`/`start`/`render`/`clear`) for in-editor surfaces. Keep the always-safe no-op fallback so a vendor UI change never breaks the user's agent. The `Orchestrator` + `ViewTracker` + `ApiClient` are done and tested.

### 13.3 Killswitch poller — already wired
`GET /config` exists and the extension's `Killswitch` already polls `${API_BASE}/config`. Nothing to do except set the global flag via `POST /admin/killswitch` in an incident.

### 13.4 Fraud hardening (iterative)
- ✅ **IP-hash clustering — done [NEW]** (server-derived salted hash on `AdEvent.ipHash` + windowed Redis `FraudService` flagging `ip_cluster`).
- ✅ **Creative moderation — done [NEW]** (pending → `POST /admin/campaigns/:id/approve`).
- ✅ **Pacing — done [NEW2]** (`Campaign.pacePerMinute` + Redis per-minute counter in `PacingService`; `/serve` skips paced-out campaigns).
- ✅ **Admin moderation UI — done [NEW2]** (portal `/admin`: approve campaigns, KYC-verify destinations, killswitch).
- **Still to do — backfill invalidation:** clustering flags events *after* the threshold is crossed; the first N installs already earned. A batch job could retroactively void a confirmed cluster (debit `earnings:dev` / reverse the postings).

### 13.5 Production migrations — **done [NEW]**
Versioned migrations are in place: a squashed baseline `apps/api/prisma/migrations/20260623000000_init` (the old 8-digit folder name wasn't replayable), verified to apply cleanly to a fresh DB with **zero drift**. CI and the Docker entrypoint run `prisma migrate deploy`; the dev DB was baselined via `prisma migrate resolve --applied`. To add a migration, diff against a shadow DB (see §4). `prisma:deploy` script added.

### 13.6 Observability & deployment — **mostly done [NEW2]**
- ✅ **Structured logging** via pino with secret redaction; **global exception filter**; **helmet + CORS**.
- ✅ **Error reporting** via **Sentry** (`common/sentry.ts`, DSN-guarded; 500s captured from the filter).
- ✅ **CI** (`.github/workflows/ci.yml`) + **CD** (`.github/workflows/cd.yml` — builds & pushes api/portal images to GHCR on `main`/tags) + **Dockerfiles** (api image builds clean; portal Next standalone via `NEXT_OUTPUT`) + **`docker-compose.prod.yml`**.
- **Still to do (external):** actually deploy (managed Postgres+Redis in an **India region**, portal hosting, publish the extension to the VS Code Marketplace); request tracing + metrics dashboards; secrets via a manager (not env files) in prod.

### 13.7 Legal / entity (blocks real money)
India Pvt Ltd; **IEC + FIRC** for export-of-service receipts (advertisers pay from abroad); **GST** on the platform fee; **TDS** on developer payouts; advertiser + developer ToS + privacy policy. Vendor risk: injecting into Anthropic/OpenAI/Google agent UIs is adversarial — their ToS/UI changes can break or ban us; mitigate with versioned adapters + the killswitch.

---

## 14. Known issues / tech debt
- ✅ ~~e2e flake~~ — fixed (shared IP-cluster Redis state; §11).
- ✅ ~~`db push` not migrations~~ — fixed (versioned baseline; §13.5).
- ✅ ~~RazorpayX payout not wired~~ — implemented (REST seam; §13.1). Only RazorpayX KYC/fund_account onboarding + live keys remain.
- ✅ ~~No admin moderation UI~~ — portal `/admin` (§9).
- **IP-clustering flags after the threshold** — first N installs behind an IP still earn before the cluster is detected, but an admin can now claw them back: **`POST /admin/fraud/void-cluster {ipHash}`** invalidates those events and reverses their ledger postings (`FraudService.voidCluster` + `LedgerService.reverseEvent`).
- ✅ ~~Escrow safety / no atomic reservation~~ — **fixed [NEW4]:** `postForEvent` now runs inside a transaction that takes a **per-campaign Postgres advisory lock** (`pg_advisory_xact_lock`), re-checks escrow, then writes — so concurrent impressions serialize per campaign and can never drive escrow negative. Proven by a concurrency e2e (60 simultaneous impressions on a 3-impression budget → exactly 3 paid, escrow 0; without the lock it overspent to ≈ −1000).
- ✅ ~~Ledger prices off the winner's own bid~~ — now a **generalized second-price auction** ([NEW3]): the winner pays the next-highest bid on the surface (falls back to its own bid when there's no competition). Pricing is point-in-time off current active bids, not the exact bid at serve — fine for one-bid-per-surface; revisit if a campaign holds multiple bids.
- ✅ ~~`earnings:unattributed` never reconciled~~ — **fixed [NEW4]:** anonymous impressions now **forfeit the dev share to the platform** (`revenue:platform`); nothing is parked in limbo.
- **Docker images carry dev dependencies** — runtime copies the full workspace (so the prisma CLI is available for `migrate deploy`); slim later with `pnpm deploy`/prod-prune.
- ✅ ~~Portal UI is bare / admin uses static key~~ — **fixed [NEW4]:** portal now has a clean **design system** (`app/globals.css`) across all pages, and the admin page logs in via **`POST /admin/login`** (admin JWT Bearer); the static `x-admin-key` is no longer used by the web (the API still accepts it as a legacy/break-glass header).
- **Campaign edit re-moderation is coarse** — *any* creative change on a live campaign sends the whole campaign back to `pending` (safe default). A lighter flow (e.g. auto-approve trivial URL tweaks, or a separate "pending creative" field that keeps the old copy serving until re-approval) could reduce advertiser friction later.
- **Developer web vs Google identity** — a dev who signs up by email (`type:"dev"`) and a dev who signed in with Google are **separate accounts** even with the same email. Acceptable now; merge-on-verified-email later if needed.

---

## 15. Where to read more
- **Launch-prep guides [NEW4]:** `docs/launch/DEPLOY.md` (deploy runbook + `.env.prod.example`), `docs/launch/PAYMENTS_SETUP.md` (PSP/KYC account setup → env mapping), `docs/extension/claude-code-statusline.md` (first real ad adapter), `docs/legal/` (advertiser/developer ToS + privacy templates — lawyer review required). High-level non-coding view: `LAUNCH_CHECKLIST.md`.
- **Design spec:** `docs/superpowers/specs/2026-06-22-kickbacks-india-ad-marketplace-design.md` — the architecture + decisions + risks.
- **Implementation plans** (`docs/superpowers/plans/`): one per slice (01 foundation, 02 metrics, 03 extension, 04 auth, 05 ledger, 06 payments, 07 advertiser-billing, 07b portal, 08 auction, 09 fraud). Each has the exact files, code, and reasoning — the best onboarding path is to read these in order.
- **Hardening batches 1 & 2 [NEW]/[NEW2]** (analytics, moderation, IP-clustering, real PSP adapters + webhooks, RazorpayX payout + KYC, pacing/throttling/overspend-guard, dev & admin portal, CI/CD/migrations/Dockerfiles/compose, security + Sentry, Playwright, flake fix): implemented **inline, TDD, no per-slice plan docs** (by request). Read the `feat(...)`/`chore(...)`/`test(...)`/`docs(...)` commits on `main` — each commit message documents the rationale and verification for its slice.
- **Original product** (for reference): kickbacks.ai, its FAQ, and the open-source extension at github.com/andrewmccalip/kickbacks.ai.

---

## 16. Suggested next-step priority (updated [NEW2])
1. **Live PSP credentials + RazorpayX KYC onboarding** (§13.1) — the code is done; create the accounts, complete RazorpayX contact/fund_account KYC, set keys. This turns on real money.
2. **One real spinner adapter** (Claude Code) (§13.2) — proves real earning end-to-end (still needs the live agent).
3. **Actual deploy** (§13.6): the CD workflow already builds+pushes images — point it at managed Postgres+Redis (India region) + portal hosting; publish the extension.
4. **Legal entity** in parallel (§13.7) — gates going live with real funds.
5. **Retroactive cluster void + 2nd-price pricing + escrow reservation** (§13.4, §14) as scale demands.

The marketplace is now **code-complete on the happy path** — money-in (collect+webhooks), money-out (RazorpayX payout + KYC gating + payout webhooks), serving with moderation/pacing/fraud guards, dev & admin web, and CI/CD. What's left is **credentials, the live spinner injection, deployment, and legal** — each behind a clean, documented seam.
