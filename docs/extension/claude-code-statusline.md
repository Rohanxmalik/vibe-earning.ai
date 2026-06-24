# Claude Code ad integration — status line (the first real adapter)

> **Status:** code-complete and unit-tested end-to-end (74 tests). Both integration seams are implemented: (a) the **standalone status-line script** (`dist/statusline.js`, the official `statusLine` command — the preferred path) and (b) the in-editor **`ClaudeCodeAdapter`** that drives the `Orchestrator`. The remaining work is **manual live verification** against a real Claude Code install (see "Manual live-verification" below). This is the **highest-leverage launch blocker** — it turns on real earning.

## Why the status line (not UI hacking)

Claude Code supports a **custom status line**: you point a `statusLine` command in `~/.claude/settings.json` at any executable; Claude runs it and renders its stdout at the bottom of the session. This is an **official extension point** — no patching of Anthropic's UI, far lower ToS/ban risk (see `ENGINEERING_HANDOFF.md` §13.7 and `LAUNCH_CHECKLIST.md` Phase 6). Prefer this over scraping/overwriting the "Thinking…" spinner.

The same approach generalizes: Codex and Gemini get their own adapters later, each via that tool's official status/hook mechanism.

## How it works

```
Claude Code (every status refresh)
  → runs our command, passes session JSON on stdin
  → command GETs  {API}/serve?surface=claude-code-terminal&count=1
  → prints one line:  "Sponsored: <copy> · <host>"   (house ads omit the label)
  → Claude shows that line
```

- Code: `apps/extension/src/statusline/cli.ts` (glue) + `compose.ts` (pure, tested).
- It is **fail-safe**: any error or slow network (>800ms) → prints nothing, so it can never break or hang the agent.

## Install (for a developer testing it)

1. Build the script (bundles to a single file):
   ```bash
   pnpm --filter @kbi/extension build      # emits dist/statusline.js (and dist/extension.js)
   ```
2. Point Claude Code at it — in `~/.claude/settings.json`:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node /abs/path/to/kickbacks/apps/extension/dist/statusline.js"
     }
   }
   ```
3. Set `KICKBACKS_API` if the API isn't on `http://localhost:3000`.
4. **Sign in so earnings credit to you:** put your dev token in `KICKBACKS_TOKEN`, or write it to `~/.kickbacks/token`. Get the token from the web (Developers → sign up/log in) or the extension. Without it the script still shows ads but earns nothing (anonymous impressions forfeit to the platform).
5. Open Claude Code — you should see the sponsored line. Fund a campaign on the `claude-code-terminal` surface so `/serve` returns an ad.

> **Build note:** `esbuild.mjs` already emits `dist/statusline.js` from `src/statusline/cli.ts` (separate from the VS Code extension bundle).

## Billing & attribution (now implemented — conservative by design)

- **Conservative billing** (`billing.ts`, unit-tested): the status line refreshes on a timer with no reliable view-time, so we **never** bill per refresh. `decideBilling` bills **at most one impression per shown ad-window**, and only after that window has been visible for the minimum view time (5s, matching the server). The nonce is stable per window, so duplicate refreshes are deduped server-side. Worst case we *under*-bill — we never over-bill the advertiser or over-pay the dev. House ads are never billed. Window state persists in `~/.kickbacks/statusline-state.json`.
- **Attribution:** when a token is present, both `/serve` and the `/events` impression are sent authenticated, so earnings credit the signed-in developer. No token → ads still show, but nothing is billed (anonymous would forfeit to platform anyway).

## Rotation (now implemented)

The CLI requests the **top 3** ads (`/serve?count=3`) and `tickRotation` (`billing.ts`, unit-tested) holds each for `holdMs` (default 8s — long enough to bill once at the 5s view threshold) then advances, cycling. Each rotated-in ad opens a fresh billable window via `decideBilling`. Short sessions just show ad #1; longer ones reach #2/#3 — mirroring the in-editor `Orchestrator` rotation.

## Codex / Gemini reuse

The same script backs other agents — set `KICKBACKS_SURFACE` (`codex-panel`, `gemini-cli-terminal`, …; defaults to `claude-code-terminal`, falls back to it for any unknown value via `resolveSurface`). Point each agent's status-line/hook command at `dist/statusline.js` with the right `KICKBACKS_SURFACE`.

## In-editor adapter (`ClaudeCodeAdapter`) — now implemented

Alongside the standalone script, `apps/extension/src/adapters/claudeCode.ts` is now a real adapter (no longer a stub) that the in-editor `Orchestrator` drives:

- **`isAvailable()`** self-detects Claude Code from the environment (`CLAUDECODE=1` or `CLAUDE_CODE_ENTRYPOINT`, via the injectable `detectClaudeCode`). When detected, `firstAvailable()` selects it over the dev `MockAdapter`.
- **`start(handlers)`** binds the agent's wait-state lifecycle through an injectable `WaitSource` (`onWaitStart` / `onTick` / `onWaitEnd`) and returns a dispose. The production `WaitSource` is the only piece that needs the live Claude Code runtime to bind (see manual steps); everything downstream is tested.
- **`render(ad)` / `clear()`** compose the sponsored line (`composeStatusLine`) and write/restore it via an injectable `StatusSink` — Claude Code's official status-line surface.
- **Fail-safe by construction:** detection, start, render, and clear each swallow host errors so a broken host can never break the editor; it falls back to the stock spinner.

The full loop (serve top-N → render → ~5s visible hold → rotate to ad #2/#3 → bill once per nonce after the view threshold → nothing when signed-out/killswitch/error) is proven by `claudeCode.test.ts` (incl. an end-to-end Orchestrator drive) and `cli.test.ts`.

## What's still NOT done here

- **Live verification** against a real Claude Code (and later Codex / Gemini): refresh cadence, status-line truncation, whether the refresh interval makes the 8s hold feel right, and binding the production `WaitSource` for the in-editor adapter. This is environment-bound and **cannot run in CI/this dev container** — see the manual steps below.

## Manual live-verification (run on a machine with a real Claude Code install)

> All logic is unit-tested with mocked `apiClient` / host / timers. These steps confirm the last mile — that a real Claude Code actually renders our line and credits an impression — which no unit test can cover because it requires the live agent runtime.

**Prereqs:** API reachable (default `http://localhost:3000`); a campaign **funded on the `claude-code-terminal` surface** so `/serve` returns inventory; a dev account + token.

### A. Standalone status-line script (the preferred, official path)

1. **Build:** `pnpm --filter @kbi/extension build` → confirm `dist/statusline.js` exists.
2. **Sign in (so earnings credit to you):** set `KICKBACKS_TOKEN=<your dev token>` or write the token to `~/.kickbacks/token`. (No token → ads still show but nothing is billed.)
3. **Point Claude Code at it** — in `~/.claude/settings.json`:
   ```json
   { "statusLine": { "type": "command", "command": "node /abs/path/to/apps/extension/dist/statusline.js" } }
   ```
   Set `KICKBACKS_API` if the API isn't on `localhost:3000`.
4. **Open Claude Code** and start any task so the agent runs. **Expected:** the bottom status line shows `Sponsored: <copy> · <host>` (house ads omit "Sponsored:").
5. **Verify the impression is credited.** After the line has been visible ≥5s, confirm one `AdEvent` row was recorded and attributed:
   `docker compose exec -T postgres psql -U kbi -d kbi -c 'select "campaignId","surface","visibleMs","valid","accountId" from "AdEvent" order by "createdAt" desc limit 3;'`
   **Expected:** a row with `surface = claude-code-terminal`, `valid = t`, `visibleMs ≥ 5000`, and a **non-null `accountId`** (your dev account).
6. **No double-bill:** leave it running across several status refreshes; confirm only **one** row per shown ad-window (same nonce → server dedupes).
7. **Rotation:** on a long-running task (>8s), confirm the line advances to ad #2/#3 and each rotated-in ad records its own row.
8. **Signed-out:** unset `KICKBACKS_TOKEN` / remove `~/.kickbacks/token`, restart Claude Code. **Expected:** ads still render, but **no new `AdEvent`** is recorded.
9. **Killswitch:** flip the server `/config` `active` flag on. **Expected:** the line shows nothing (stock status line) and nothing is billed.
10. **Fail-safe:** stop the API. **Expected:** Claude Code's status line is unaffected (no hang, no error spew) — the script prints nothing within the 800 ms timeout.

### B. In-editor `ClaudeCodeAdapter` (VS Code extension path)

The adapter, Orchestrator, billing, view-tracking, killswitch, and attribution are all unit-tested. The one piece needing the live runtime is binding the production **`WaitSource`** (and the **`StatusSink`**) to Claude Code's actual spinner/status events inside VS Code.

1. Implement a production `WaitSource` + `StatusSink` bound to Claude Code's in-editor status surface, and pass them to `new ClaudeCodeAdapter({ waitSource, sink })` (wire it in `src/host/extension.ts` in place of / ahead of the `MockAdapter` fallback).
2. Run the extension (F5 → Extension Development Host) **inside** an environment where `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` is set so `isAvailable()` returns true and `firstAvailable()` selects it.
3. Trigger a real Claude Code wait-state and confirm the same expectations as A.5–A.10 (render, single bill per nonce, rotation, signed-out, killswitch, fail-safe).

## Acceptance (definition of done for this blocker)

- [x] esbuild emits `dist/statusline.js` (verified: runs as a real script, fails safe against an unreachable API).
- [x] Conservative status-line impression/billing rule (`billing.ts`, unit-tested).
- [x] Attribute to the signed-in developer (bearer token on `/serve` + `/events`; impression posted only when authenticated).
- [x] Fail-safe: errors/slow API never disrupt the agent (bounded timeout, all errors swallowed) — verified for the script and the adapter.
- [x] `count=3` rotation through the top ads (`tickRotation`, unit-tested; exercised through `runStatusLine` and the Orchestrator).
- [x] **Official status-line wiring is testable end-to-end** (`runStatusLine` in `cli.ts`, unit-tested for all five behaviors).
- [x] **`ClaudeCodeAdapter` implemented** (no longer a stub) and unit-tested, incl. an end-to-end Orchestrator drive.
- [ ] On a real Claude Code, the sponsored line renders from a funded campaign and an impression is credited (**manual** — see steps above; cannot run in CI).
- [ ] Bind the production `WaitSource`/`StatusSink` for the in-editor adapter (**manual** — needs the live runtime).
- [ ] Repeat the adapter for Codex / Gemini (same pattern: official status/hook mechanism per tool).
