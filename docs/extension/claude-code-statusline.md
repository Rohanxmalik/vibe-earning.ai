# Claude Code ad integration — status line (the first real adapter)

> **Status:** prototype. The composing logic is unit-tested (`apps/extension/src/statusline/compose.ts`); the live wiring needs verification against a real Claude Code install. This is the **highest-leverage launch blocker** — it turns on real earning.

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

## What's still NOT done here

- **Live verification** against a real Claude Code (refresh cadence, status-line truncation behaviour).
- **Rotation.** `count=1` for now; once verified, request `count=3` and rotate per window (the API + `composeStatusLine` already support multiple ads).
- **Codex / Gemini** adapters (same pattern, each tool's own official surface).

## Acceptance (definition of done for this blocker)

- [x] esbuild emits `dist/statusline.js`.
- [x] Conservative status-line impression/billing rule (`billing.ts`, unit-tested).
- [x] Attribute to the signed-in developer (bearer token on `/serve` + `/events`).
- [x] Fail-safe: errors/slow API never disrupt the agent (bounded timeout, all errors swallowed).
- [ ] On a real Claude Code, the sponsored line renders from a funded campaign and an impression is credited.
- [ ] Then: `count=3` rotation, and repeat for Codex / Gemini.
