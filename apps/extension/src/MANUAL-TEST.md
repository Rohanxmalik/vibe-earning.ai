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

## Real adapters (NOT yet implemented)
`claudeCode.ts` / `codex.ts` / `geminiCli.ts` are stubs (`isAvailable() === false`). Implementing real wait-state detection + line rendering for each agent is a separate research task — verify each against its live agent before enabling.
