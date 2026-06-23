# Kickbacks-India (vibe-earning.ai)

An India-first clone of [kickbacks.ai](https://kickbacks.ai): a two-sided **advertising marketplace** that sells the one-line "Thinking…" status shown by AI coding agents (Claude Code, Codex, Gemini CLI) while they work.

- **Supply = developers.** A VS Code extension shows a sponsored line while their AI agent is busy; they earn ~50% of the ad revenue.
- **Demand = advertisers** (global). Self-serve: create a campaign, set a bid, fund it; the ad serves on developers' machines.
- **The India wedge:** kickbacks.ai pays out only via Stripe Connect (India is "preview"), so Indian developers can't cash out. We pay out in **INR via Razorpay/UPI** (Stripe for the rest), behind a provider abstraction.

> **New here?** Read [`ENGINEERING_HANDOFF.md`](./ENGINEERING_HANDOFF.md) — a full, file-by-file tour of what's built, what's left, and how.

## Architecture

A **pnpm + Turborepo monorepo**, TypeScript end-to-end.

```
apps/
  api/        NestJS + Prisma/Postgres + Redis — the marketplace brain
  extension/  VS Code extension — the developer/supply client
  portal/     Next.js — advertiser dashboard + developer earnings view
packages/
  shared/     zod schemas + types shared by every app
```

The end-to-end loop: advertiser funds a campaign → escrow credited in a double-entry ledger → developer's agent waits → `GET /serve` returns the top funded, approved, paced ad → `POST /events` records a validated impression → ledger debits escrow and credits the dev (~50%) + platform → dev with a verified payout destination cashes out (routed India→Razorpay, else→Stripe), settled via webhook.

## Quickstart

Prereqs: **Node 22+**, **pnpm 9** (`npm i -g pnpm@9`), **Docker** (for Postgres + Redis).

```bash
pnpm install
docker compose up -d                       # Postgres :5432, Redis :6379
cp .env.example apps/api/.env              # dev config (git-ignored)

pnpm --filter @kbi/shared build            # api tests resolve @kbi/shared from dist
pnpm --filter @kbi/api exec prisma migrate deploy
pnpm --filter @kbi/api exec prisma generate

pnpm --filter @kbi/api dev                 # API on :3000
pnpm --filter @kbi/portal dev              # Portal on :3001
```

## Test

```bash
pnpm test          # all packages (api needs Docker up)
pnpm lint          # type-check all packages
pnpm build         # build all packages
```

Current: **api 128 · extension 22 · shared 14 · portal 7** automated tests.

## Deploy

- **Migrations:** versioned in `apps/api/prisma/migrations`; apply with `prisma migrate deploy` (CI and the Docker entrypoint do this).
- **Containers:** `apps/api/Dockerfile` and `apps/portal/Dockerfile` (build context = repo root). `docker-compose.prod.yml` runs the full stack.
- **CI/CD:** `.github/workflows/ci.yml` (lint/test/build) and `.github/workflows/cd.yml` (build + push images to GHCR on `main`/tags).

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Configuration

See [`.env.example`](./.env.example) for all variables (DB/Redis, JWT, admin key, Stripe/Razorpay keys + webhook secrets, RazorpayX, fraud/metrics knobs, CORS, log level).

## License

Proprietary — all rights reserved (pre-launch).
