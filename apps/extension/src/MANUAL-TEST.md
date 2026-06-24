# Manual test — Kickbacks-India extension

The pure core is unit-tested. This verifies the VS Code wiring end-to-end against the running api.

## Prerequisites
- `docker compose up -d` (Postgres + Redis) and api running: `pnpm --filter @kbi/api dev`
- Seed a house ad: `curl -X POST localhost:3000/admin/house-ads -H "x-admin-key: dev-admin-key-change-me" -H "content-type: application/json" -d '{"copy":"Hello from KBI","url":"https://kbi.example","surface":"claude-code-terminal"}'`

## Run the extension
1. `pnpm --filter @kbi/extension build`
2. Open `apps/extension` in VS Code, press **F5** (Extension Development Host).
3. Command Palette → **Kickbacks: Simulate Wait-State (dev)** → then **Kickbacks: End Wait-State (dev)**.
4. Confirm an `AdEvent` row was recorded:
   `docker compose exec -T postgres psql -U kbi -d kbi -c 'select "campaignId","surface","visibleMs","valid" from "AdEvent" order by "createdAt" desc limit 1;'`
   Expected: a row with `valid = t` and a `visibleMs` ≈ the time between the two commands.

## Sign in (dev)
The api verifies Google ID tokens; the real OAuth consent UI is a follow-up. For now:
1. Obtain a Google ID token for your test OAuth client (e.g. via the OAuth Playground) OR run the api with the verifier mocked.
2. Command Palette → **Kickbacks: Sign in (dev: paste Google ID token)** → paste it.
3. Re-run the simulate/end commands; the recorded `AdEvent` should now have a non-null `accountId`.

## Real adapters
- **Claude Code** is implemented two ways and unit-tested end-to-end:
  - the standalone status-line script (`statusline/cli.ts` → `dist/statusline.js`, the official `statusLine` command — preferred), and
  - the in-editor `claudeCode.ts` adapter (`isAvailable()` self-detects via `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`; renders via an injectable `StatusSink`; driven by an injectable `WaitSource`).
  Remaining work is **live verification** against a real Claude Code and binding the production `WaitSource`/`StatusSink` — see `docs/extension/claude-code-statusline.md` → "Manual live-verification".
- `codex.ts` / `geminiCli.ts` are still stubs (`isAvailable() === false`); they reuse the same status-line script via `KICKBACKS_SURFACE`. Implementing each tool's native wait-state detection is a follow-up — verify against its live agent before enabling.
