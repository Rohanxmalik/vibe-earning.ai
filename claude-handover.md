# Claude Handover — vibe-earning.ai (vibearning)

**Purpose:** Continue this work in a fresh Claude Code session on another device.
**Branch:** `feat/cc-vscode-sponsored-line` (pushed to `origin`). Start there.
**Last updated:** 2026-07-02.

---

## TL;DR for the next Claude session

1. **Rebranded `Kickbacks`/`KBI` → `vibearning`** (all lowercase) across the whole codebase — npm scope `@vibearning/*`, env `VIBEARNING_*`, extension commands `vibearning.*`, token dir `~/.vibearning`. **Deliberately unchanged:** Postgres creds `kbi:kbi/kbi`, Docker containers `kickbacksaiforindia-*`, the folder path.
2. **Claude Code TERMINAL/CLI ad-injection WORKS — verified live and earning** (status-line CLI, real impression billing).
3. **VS Code EXTENSION is COMPLETE and packaged.** Full in-editor client, unit-tested (151 tests): transcript-driven wait detection, top-N rotation with round-robin, a rich **sidebar "vibearning" webview panel** (branded ad card + logo + live earnings + ▲ session ticker + "in rotation · up next" line-up), an always-on status-bar line, conservative billing. Packaged as **`apps/extension/vibearning.vsix`** (icon, LICENSE, README, prod-configurable `vibearning.apiUrl`/`portalUrl` settings, dev commands stripped).
4. **Campaigns are multi-surface** — the portal targets Claude Code + Codex (one bid per surface). **Advertiser logo upload** works end-to-end (portal `LogoInput` → `POST /uploads/logo` → object storage).
5. **Object storage is code-complete** — `BlobStorage` seam: `LocalDiskStorage` (dev) + **`S3Storage`** (prod: AWS S3 / R2 / Supabase; AWS SDK lazy-loaded). Set `VIBEARNING_STORAGE=s3` + bucket env to go live (`docs/launch/DEPLOY.md`).
6. **What's left is EXTERNAL only** (no code blockers): deploy the backend (host + managed Postgres/Redis + a bucket), register a Marketplace publisher + PAT and `vsce publish`, and the legal/ToS/privacy read. See `LAUNCH_CHECKLIST.md` + `ENGINEERING_HANDOFF.md` §13.

> ⚠️ **Dev-env footgun:** running the API jest suite (`apps/api`) **wipes the dev DB** (`jest.global-setup.js` `deleteMany`s every table). After any wipe / Redis restart, restore ad inventory with `node apps/api/scripts/seed-demo-ads.mjs`. Bring-up: Docker up → `docker start kickbacksaiforindia-postgres-1 kickbacksaiforindia-redis-1` → `npx nest start --watch` in `apps/api`.

---

## What the product is

vibearning: an ad marketplace that shows a single **sponsored line while an AI coding
agent is "thinking"** (Claude Code, later Codex/Gemini). Indian developers earn (UPI payouts);
advertisers pay per viewed impression via a conservative, fail-safe, second-price billing loop.

Monorepo (pnpm + turbo):
- `apps/api` — NestJS API (serve ads, ingest impressions, ledger/billing, auth, metrics). Port **3000**.
- `apps/portal` — Next.js site (landing, advertiser/admin consoles, **developer earnings dashboard**). Port **3001**.
- `apps/extension` — the VS Code extension **and** the standalone Claude Code status-line CLI script.
- `packages/shared` — shared zod DTOs + the `Surface` enum.

---

## What works now (verified this session)

### A. Claude Code TERMINAL/CLI sponsored line — LIVE + EARNING ✅

Mechanism (the official, ToS-safe path — no UI hacking):
- Claude Code's `statusLine` setting runs our built script `apps/extension/dist/statusline.js`
  on every status refresh. The script: probes a killswitch → `GET /serve?surface=claude-code-terminal&count=3`
  → composes `Sponsored: <copy> · <host>` → prints one line → after the line is visible ≥5s it
  posts `POST /events` (authenticated when a token exists) → billing credits the dev ~50%.
- It is **fail-safe**: any error / slow network (>800ms) → prints nothing, never breaks/hangs Claude.

Wiring used (local-only, see setup below):
- `.claude/settings.local.json` (gitignored) points `statusLine` at the built script using an
  **absolute node path** (the machine uses nvm-for-windows, so `node` isn't on Claude Code's PATH).
- Token read from `~/.vibearning/token`; API + surface default to localhost:3000 + claude-code-terminal,
  so **no env vars are needed** in the statusLine command.

**Verified:** in a real `claude` terminal session the line rendered and the demo dev's earnings
went 25 → 100 paise (4 valid impressions). The line rotates between the funded "Acme DB" ad and a
house ad; only the funded one bills.

> Note: `statusLine` is a **CLI-only** Claude Code feature. The Claude Code **VS Code extension
> panel does NOT render it** — that's exactly why we're building the extension path (section below).

### B. Local stack + dummy data (so /serve returns inventory)

- `docker compose up -d` → Postgres on host port **5433** (mapped to container 5432) + Redis 6379.
  (We changed the compose mapping to 5433; `apps/api/.env` `DATABASE_URL` must match 5433.)
- Prisma migrations applied; Prisma client generated.
- Seeds:
  - `pnpm --filter @vibearning/api seed` (with `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`) → admin + **house ads**
    (one per surface, incl. `claude-code-terminal`). House ads show but never bill.
  - `apps/api/scripts/seed-demo.mjs` (`pnpm --filter @vibearning/api exec node scripts/seed-demo.mjs`) →
    a **funded** dummy advertiser campaign on `claude-code-terminal` (₹50,000 escrow, 50 paise/impression),
    ranked above the house ad, so `/serve` returns a real "Sponsored" ad that bills.
- Demo accounts created by the seeds (fresh local DB):
  - admin: `admin@vibearning.test` / `admin12345`
  - dev (earnings demo): `demo-dev@vibearning.test` / `Password123!` — its token is written to `~/.vibearning/token`.
  - advertiser `demo-advertiser@vibearning.test` (no password; exists only to own the campaign).

---

## In-progress feature: VS Code extension sponsored line

**Goal:** show the sponsored line in **VS Code's bottom status bar** while Claude works in the
editor panel (we cannot draw inside Anthropic's panel — no VS Code API for that), and bill the
same way as the CLI path. Distinct ad surface: **`claude-code-panel`**.

**Design + plan (committed on the branch):**
- Spec: `docs/superpowers/specs/2026-06-28-claude-code-vscode-sponsored-line-design.md`
- Plan: `docs/superpowers/plans/2026-06-28-claude-code-vscode-sponsored-line.md` (7 tasks, TDD)

**Approach (decided):** fill the two no-op seams of the existing `ClaudeCodeAdapter`:
- `WaitSource` = detect "thinking" by **watching the Claude session transcript**
  `~/.claude/projects/<slug>/<session>.jsonl` (a real user prompt opens the window; an assistant
  `stop_reason:"end_turn"` line, or a 90s idle timeout, closes it). Zero-config, no edits to the
  user's global Claude settings.
- `StatusSink` = render into our own VS Code `StatusBarItem` (clickable → opens the ad URL).
- Everything downstream (Orchestrator, ViewTracker, Killswitch, ApiClient, compose, billing) is
  already built + unit-tested and is **reused unchanged**.

**Key technical decisions / gotchas baked into the plan:**
- `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` env vars are **NOT set in the VS Code extension host**
  (only in CLI-spawned processes), so presence is detected via
  `vscode.extensions.getExtension("Anthropic.claude-code")` (note the capital **A**; try lowercase too).
- Render = `window.createStatusBarItem` (stable, publishable). Detect = `createFileSystemWatcher` +
  `RelativePattern(Uri.file(~/.claude/projects), "**/*.jsonl")` (stable, out-of-workspace watch since
  VS Code 1.64). Avoid `onDidWriteTerminalData` (proposed API → not Marketplace-publishable).
- Cross-platform paths: use native `node:path` (NOT `node:path/posix`) — posix join corrupts
  Windows paths.
- The in-editor adapter serves `claude-code-panel`; the CLI/terminal path stays `claude-code-terminal`.
  Seeds must add inventory on `claude-code-panel` (Task 6).

**Progress (subagent-driven TDD, two-stage review per task):**
- ✅ Task 1 — `ClaudeCodeAdapter.surface` → `claude-code-panel`; `StatusSink.write(line, url?)`; render passes `ad.url`. (commit `cf05c56`)
- ✅ Task 2 — `SessionLocator` (`projectSlug` + `findNewestTranscript`, injectable `LocatorFs`). (commits `4f20e9f`, `b5b2f5f`)
- ✅ Task 3 — `ThinkingWaitSource` (the transcript-driven state machine). (commit `38697b3`) — review clean.
- ✅ Task 4 — `StatusBarSink`. (commit `5086c24`) — review clean.
- ✅ Task 5 — wired `extension.ts` (ad status item + open command, production watch/readLastLine deps, adapter selection by extension presence, token fallback to `~/.vibearning/token`). (commit `9c1d9f5`) — lint+build clean, watcher-dispose chain verified.
- ✅ Task 6 — seeded `claude-code-panel` inventory (`seed.mjs` house ad + `seed-demo.mjs` funded campaign on both surfaces). (commit `4fca7bb`) — **code only; the run+`curl` verify (plan steps 3-4) is DEFERRED to Task 7 because the local stack was down.**
- ⬜ Task 7 — **manual end-to-end verification in the VS Code extension (F5 Extension Development Host). ← the only thing left, and it is the real gate.** Includes the deferred Task 6 steps: bring the stack up, run both seeders, and `curl "http://localhost:3000/serve?surface=claude-code-panel&count=3"` to confirm a funded panel ad serves; then confirm the status-bar line renders while Claude thinks, is clickable, and that `/ledger/me/stats` increments.
- Polish commit `5c0b1c7`: added a positive `tool_use`-doesn't-end-turn test + documented the folderless-window adapter guard.

Tasks 3–6 were executed via `superpowers:subagent-driven-development` (implementer + per-task spec/quality review, then a whole-branch review on Opus). Extension suite green at **94/94**. Final review verdict: **ready to merge with fixes (none blocking)** — no Critical, no true-bug Important.

### Known limitations to confirm/note during Task 7 (from the final review — neither is a billing/correctness hole; both are fail-safe)
1. **Folderless VS Code window** → no in-editor ad (no workspace path ⇒ no transcript slug to resolve; falls back to the dev MockAdapter, which renders nothing without the dev `simulateWait` command). Now documented in code so nobody "simplifies" the guard away.
2. **Two VS Code windows running Claude at once** → `findNewestTranscript`'s global-newest fallback can cross workspaces, so a window could briefly show an ad keyed to the OTHER window's turn. Impressions still bill to the same install; single-session is the norm. Flag as a v1 follow-up.

Full code for every task (tests + implementation) is also written verbatim in the plan file.

---

## How to set up on a fresh device (co-founder)

```bash
# 1. Clone + branch
git clone https://github.com/Rohanxmalik/vibe-earning.ai.git
cd vibe-earning.ai
git checkout feat/cc-vscode-sponsored-line

# 2. Install + build
pnpm install
pnpm --filter @vibearning/shared build
pnpm --filter @vibearning/extension build      # produces apps/extension/dist/statusline.js

# 3. API env (apps/api/.env is gitignored — create it)
cp .env.example apps/api/.env           # then edit:
#   DATABASE_URL=postgresql://kbi:kbi@127.0.0.1:5433/kbi?schema=public   # NOTE: port 5433
#   REDIS_URL=redis://127.0.0.1:6379
#   AUTH_JWT_SECRET=dev-jwt-secret-change-me
#   ADMIN_API_KEY=dev-admin-key-change-me

# 4. Stack + DB
docker compose up -d                     # Postgres :5433, Redis :6379
pnpm --filter @vibearning/api exec prisma migrate deploy
pnpm --filter @vibearning/api exec prisma generate

# 5. Seed inventory (house ads + funded dummy campaign)
SEED_ADMIN_EMAIL=admin@vibearning.test SEED_ADMIN_PASSWORD=admin12345 pnpm --filter @vibearning/api seed
pnpm --filter @vibearning/api exec node scripts/seed-demo.mjs

# 6. Run
pnpm --filter @vibearning/api dev               # API :3000
pnpm --filter @vibearning/portal dev            # Portal :3001
```

### Recreate the local-only Claude wiring (NOT in git — per-machine)

These two artifacts are intentionally untracked and use absolute, machine-specific paths:

1. **Dev token** for earnings attribution — register a dev and save its token:
   ```bash
   curl -s -X POST http://localhost:3000/dev/register -H "content-type: application/json" \
     -d '{"email":"demo-dev@vibearning.test","password":"Password123!"}'
   # copy the "token" value, then:
   mkdir -p ~/.vibearning && printf '%s' '<TOKEN>' > ~/.vibearning/token
   ```
   (If `demo-dev@vibearning.test` already exists, use `/dev/login` instead.)

2. **`.claude/settings.local.json`** (gitignored) — wire the CLI status line to the built script,
   using YOUR absolute node path and repo path:
   ```json
   {
     "$schema": "https://json.schemastore.org/claude-code-settings.json",
     "statusLine": {
       "type": "command",
       "command": "<ABS_PATH_TO_node(.exe)> <ABS_PATH_TO_REPO>/apps/extension/dist/statusline.js",
       "padding": 0,
       "refreshInterval": 5
     }
   }
   ```
   - Find your node: `which node` (or `(Get-Command node).Source` on PowerShell). If you use nvm,
     use the absolute path (e.g. `C:/nvm4w/nodejs/node.exe`) — `node` may not be on Claude Code's PATH.
   - Then **restart Claude Code** and run `claude` in a terminal. While it thinks, the sponsored line
     appears at the bottom; earnings climb on the portal dev dashboard
     (`http://localhost:3001` → login `demo-dev@vibearning.test` / `Password123!`).

---

## Git state at handover

- Branch `feat/cc-vscode-sponsored-line` pushed to `origin`. Commits (newest first):
  - `b5b2f5f` fix(ext): SessionLocator native node:path + platform-agnostic tests
  - `4f20e9f` feat(ext): SessionLocator
  - `cf05c56` feat(ext): in-editor adapter serves claude-code-panel; StatusSink url
  - `ddf78a0` docs: implementation plan
  - `30fa4b6` docs: design spec
  - plus a chore commit for: `docker-compose.yml` (PG→5433), `.gitignore` (ignore `.claude/settings.local.json`),
    `apps/api/scripts/seed-demo.mjs` (funded dummy seeder), and this `claude-handover.md`.
- **Not committed on purpose:** root `package-lock.json` is a stray npm artifact (this is a pnpm
  repo — the real lockfile is `pnpm-lock.yaml`); it can be deleted. `apps/api/.env` and
  `.claude/settings.local.json` are gitignored (per-machine).
- Full extension test suite is green (80/80) as of Task 2.

---

## How to resume the in-editor build (next session)

1. `git checkout feat/cc-vscode-sponsored-line && pnpm install`
2. Open the plan: `docs/superpowers/plans/2026-06-28-claude-code-vscode-sponsored-line.md`.
3. Use the `superpowers:subagent-driven-development` skill; start at **Task 3 (ThinkingWaitSource)**
   and proceed through Task 7. Each task in the plan has complete tests + implementation code and a
   commit step. After all tasks, do the final holistic review + `superpowers:finishing-a-development-branch`.
4. Task 7 is manual: build the extension, launch the Extension Development Host (F5) in VS Code,
   use Claude Code in that window, and confirm the status-bar sponsored line shows while thinking,
   is clickable, and bills (earnings increase for the `claude-code-panel` surface).
