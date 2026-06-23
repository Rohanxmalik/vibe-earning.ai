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
4. Open Claude Code — you should see the sponsored line. Fund a campaign on the `claude-code-terminal` surface so `/serve` returns an ad.

> **Build note:** `esbuild.mjs` already emits `dist/statusline.js` from `src/statusline/cli.ts` (separate from the VS Code extension bundle).

## What's deliberately NOT done here (and why)

- **Billing an impression.** The status line refreshes on a timer with no reliable *view-time*, and Anthropic may cache/refresh unpredictably. Charging per refresh would be wrong (over-billing advertisers, over-paying devs). Impression accounting stays in the extension's `Orchestrator` + `ViewTracker` pipeline, which measures real focused on-screen time. A status-line-only billing model would need a separate, conservative "shown for ≥N seconds" heuristic — design before enabling.
- **Rotation.** `count=1` for now. Once billing is sorted, request `count=3` and rotate per refresh (the API + `composeStatusLine` already support multiple ads).
- **Auth/attribution.** This prototype serves anonymously (earnings would forfeit to platform under the current policy). To credit the developer, the script must send the dev's bearer token (from the extension's secret store) — wire once the dev is signed in.

## Acceptance (definition of done for this blocker)

- [x] esbuild emits `dist/statusline.js`.
- [ ] On a real Claude Code, the sponsored line renders from a funded campaign.
- [ ] Errors/slow API never disrupt the agent (kill the API → status line just shows nothing).
- [ ] Decide + implement the conservative status-line impression/billing rule.
- [ ] Attribute to the signed-in developer (send bearer token).
- [ ] Then: `count=3` rotation, and repeat for Codex / Gemini.
