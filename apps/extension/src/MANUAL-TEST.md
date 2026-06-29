# Manual test — Kickbacks-India extension

The pure core is unit-tested. This verifies the VS Code wiring end-to-end against the running api.

## Prerequisites
- `docker compose up -d` (Postgres + Redis) and api running: `pnpm --filter @kbi/api dev`
- Seed a house ad with the structured brand fields:
  `curl -X POST localhost:3000/admin/house-ads -H "x-admin-key: dev-admin-key-change-me" -H "content-type: application/json" -d '{"copy":"Zomato — Delivering Happiness","headline":"Zomato","tagline":"Delivering Happiness","brandColor":"#E23744","emoji":"🍔","url":"https://zomato.com","surface":"claude-code-terminal"}'`

## Run the extension
1. `pnpm --filter @kbi/extension build`
2. Open `apps/extension` in VS Code, press **F5** (Extension Development Host).
3. Command Palette → **Kickbacks: Simulate Wait-State (dev)** → then **Kickbacks: End Wait-State (dev)**.
4. Confirm an `AdEvent` row was recorded:
   `docker compose exec -T postgres psql -U kbi -d kbi -c 'select "campaignId","surface","visibleMs","valid" from "AdEvent" order by "createdAt" desc limit 1;'`
   Expected: a row with `valid = t` and a `visibleMs` ≈ the time between the two commands.

## Brand fields — visual check (headline/tagline/emoji/color)
With the brand-field house ad seeded above, while the ad is shown (between Simulate and End):
1. The status-bar line reads **`✨ 🍔 Zomato — Delivering Happiness · zomato.com`** (sparkle from the sink, then the brand emoji, brand name — tagline, host). House ads omit the `Sponsored:` label; a paid campaign shows it.
2. The line text is **tinted `#E23744`** (Zomato red). On turn end it reverts to the **`✓ Ad shown`** badge in the theme's default color (tint cleared).
3. The full tagline stays visible (the status bar auto-widens; the render cap is 120).
4. Advertiser side: create a campaign at `/campaigns` — set Emoji (capped to 1), Brand name (≤20), Tagline (≤40), and a Brand color; the live preview mirrors the status-bar line. The server derives the legacy `copy` from headline+tagline. A very light/dark color shows a contrast warning.

## Sign in (dev)
Email/password — the same developer account used on the web portal (no OAuth setup needed).
1. Command Palette → **Kickbacks: Sign in** → choose **Create account** (or **Log in**) → enter an email + password (≥8 chars to register).
2. The right-hand status item flips from **`$(sign-in) Kickbacks · Sign in to earn`** to **`$(rocket) Kickbacks ₹0.00`**.
3. Run a thinking turn (or the simulate/end commands); the recorded `AdEvent` now has a non-null `accountId`, and a **paid** ad credits `earnings:dev:<id>` — the status item's ₹ total climbs.
4. **Kickbacks: Sign out** clears the token (the item returns to the sign-in call-to-action).

> Note: house ads pay nothing — to see earnings move you need a *paid*, funded campaign on the surface (see the live-earnings setup). The `~/.kickbacks/token` file is an alternate credential source for the standalone status-line CLI.

## Real adapters
- **Claude Code** is implemented two ways and unit-tested end-to-end:
  - the standalone status-line script (`statusline/cli.ts` → `dist/statusline.js`, the official `statusLine` command — preferred), and
  - the in-editor `claudeCode.ts` adapter (`isAvailable()` self-detects via `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`; renders via an injectable `StatusSink`; driven by an injectable `WaitSource`).
  Remaining work is **live verification** against a real Claude Code and binding the production `WaitSource`/`StatusSink` — see `docs/extension/claude-code-statusline.md` → "Manual live-verification".
- `codex.ts` / `geminiCli.ts` are still stubs (`isAvailable() === false`); they reuse the same status-line script via `KICKBACKS_SURFACE`. Implementing each tool's native wait-state detection is a follow-up — verify against its live agent before enabling.
