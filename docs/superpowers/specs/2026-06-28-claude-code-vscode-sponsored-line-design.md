# Design: In-editor sponsored line for Claude Code (VS Code extension)

**Date:** 2026-06-28
**Status:** Approved (brainstorming → ready for implementation plan)
**Goal:** Make the vibearning sponsored line work in **both** Claude Code surfaces — the
terminal/CLI (already live via `dist/statusline.js`) **and** the VS Code extension context
(new work in this spec).

---

## 1. Problem & constraint

The product shows a sponsored line while an AI coding agent is "thinking". The CLI path
works today: Claude Code's official `statusLine` setting runs `dist/statusline.js`, which
renders the line at the bottom of the terminal session.

The **VS Code extension** path does not work, because of a hard platform constraint:

- **A third-party VS Code extension cannot render inside Anthropic's Claude Code panel.**
  There is no API to draw in another extension's webview, read its status bar text, or read
  its "thinking" state. (Verified: the Claude Code extension `activate()` returns `undefined`
  — no `exports`; `Anthropic.claude-code` exposes only fire-and-forget commands + a URI
  handler; VS Code has no API to enumerate/read another extension's `StatusBarItem`.)

Therefore the in-editor ad renders in **VS Code's own bottom status bar** while Claude works
in the panel — not inside Anthropic's chat panel. This is an accepted product decision.

## 2. What already exists (reuse, do not rebuild)

`apps/extension` already contains the full, unit-tested loop. Two seams were deliberately
left as no-op defaults and documented as the production TODO
(`docs/extension/claude-code-statusline.md`):

- `ClaudeCodeAdapter` (`src/adapters/claudeCode.ts`) — code-complete; takes injectable
  `WaitSource` and `StatusSink` (both default to no-ops today).
- `Orchestrator` (`src/core/orchestrator.ts`) — serve → render → 5s hold (`ViewTracker`) →
  bill once per nonce → rotate top-3 → clear on wait-end; killswitch + offline queue wired.
- `ApiClient` (serve/serveMany/sendEvent/offline queue), `compose` (`"Sponsored: <copy> · <host>"`,
  house ads drop the label), `billing`, `nonce`, `ViewTracker`, `Killswitch` — all built + tested.

**The job is to implement the two seams and wire them — nothing downstream changes.**

## 3. Approach

Extend `apps/extension` (no new extension). Detection follows the existing vibearning
principles — **non-invasive, official extension points, fail-safe, zero-config** (same ethos
as the CLI path): we do **not** modify the user's global `~/.claude/settings.json` and do
**not** scrape/patch Anthropic's UI.

- **Render** → our own VS Code `StatusBarItem`.
- **Detect "thinking"** → watch the active Claude **session transcript** file (zero-config,
  stable VS Code API).
- **Surface** → `claude-code-panel` (distinct from `claude-code-terminal`).

## 4. Components (each small, single-purpose, independently testable)

### 4.1 `ThinkingWaitSource` (new) — `src/host/thinkingWaitSource.ts`
Implements `WaitSource = (handlers: WaitHandlers) => () => void`.

- Locates the newest session JSONL for the current workspace (via `SessionLocator`) and
  watches its folder with
  `workspace.createFileSystemWatcher(new RelativePattern(Uri.file(<~/.claude/projects/<slug>>), '*.jsonl'))`
  (stable; out-of-workspace watching supported since VS Code 1.64; non-recursive).
- On each change, parse the **last line** of the transcript:
  - `type:"user"` with string `message.content` (a real prompt, not a `tool_result`) →
    `handlers.onWaitStart()` (turn begins) if not already in a thinking window.
  - `type:"assistant"` with `message.stop_reason === "end_turn"` → `handlers.onWaitEnd()`.
  - This brackets the whole request→response **including tool-call gaps**.
- A 1s timer calls `handlers.onTick?.()` while in the thinking state (drives view-time
  accumulation + rotation in the Orchestrator).
- **Safety net:** if no activity for 90s while "thinking", force `onWaitEnd` (never stuck).
- **Fail-safe:** every FS/parse error is swallowed; a watcher that fails → no waits fire →
  stock editor UI; never throws.
- Returns a dispose that tears down the watcher + timers.
- **Injectable deps** for tests: a clock (`now()`), the watcher factory / an event source,
  and the line parser — so the state machine is tested with synthetic events, no real FS.

### 4.2 `SessionLocator` (new, pure) — `src/host/sessionLocator.ts`
- Maps a workspace directory to Claude's project slug (cwd with `:` `\` `/` replaced by `-`),
  resolves `~/.claude/projects/<slug>/`, returns the most-recently-modified `*.jsonl`.
- Pure/injectable (homedir + dir listing injected) → unit-testable.

### 4.3 `StatusBarSink` (new) — `src/host/statusBarSink.ts`
Implements `StatusSink`.

- `write(line, url?)` → sets the item text `$(sparkle) <line>` and `.show()`; stores `url`
  for the click command.
- `restore()` → `.hide()`.
- Backed by a `StatusBarItem` (right-aligned, high priority), with `tooltip` (advertiser +
  "Why am I seeing this?") and `command = "vibearning.openSponsor"`.
- The VS Code item is injected so tests use a fake.
- **Interface change:** `StatusSink.write(line: string, url?: string)` (was `write(line)`),
  and `ClaudeCodeAdapter.render(ad)` passes `ad.url` through. CLI path unaffected (it does not
  use `StatusSink`).

### 4.4 Wire-up — `src/host/extension.ts`
- Register command `vibearning.openSponsor` → `vscode.env.openExternal(Uri.parse(currentUrl))`.
- When Claude is detected (`detectClaudeCode()` — existing), construct
  `new ClaudeCodeAdapter({ waitSource: thinkingWaitSource, sink: statusBarSink })` and pass it
  to the Orchestrator instead of the `MockAdapter` fallback. `MockAdapter` remains the dev
  fallback when Claude is not detected.
- Keep the existing earnings status item (`$(rocket) vibearning ₹x`, updated via `onEarn`) and
  the `vibearning.signIn` dev command.

### 4.5 Adapter surface — `src/adapters/claudeCode.ts`
- Change `surface` from `"claude-code-terminal"` to `"claude-code-panel"` so editor
  impressions are distinct from terminal ones. The Orchestrator serves from `adapter.surface`.

## 5. Auth / token
- Extension reads the bearer token from `context.secrets` (existing).
- **Add a fallback:** if no secret token, read `~/.vibearning/token` (the CLI token store), so
  a signed-in CLI dev earns in the extension too without re-login. Fail-safe if absent → ads
  still show, nothing billed (anonymous), matching the documented signed-out behavior.

## 6. Demo / inventory
- Extend the seeders so `/serve?surface=claude-code-panel` returns inventory:
  - add a house ad on `claude-code-panel` (in `scripts/seed.mjs`'s `HOUSE_ADS`).
  - add a funded demo campaign on `claude-code-panel` (in `scripts/seed-demo.mjs`).

## 7. Data flow (end to end)

```
user submits prompt in Claude panel
  → ~/.claude/projects/<slug>/<session>.jsonl appends a `user` line
  → FileSystemWatcher change → ThinkingWaitSource parses last line → onWaitStart
  → Orchestrator: killswitch ok → ApiClient.serveMany("claude-code-panel", 3) → queue
  → showNext → ClaudeCodeAdapter.render(ad) → StatusBarSink.write(line, ad.url) → item shows
  → onTick (1s) → ViewTracker accrues visibleMs; at >=5s bill once per nonce + rotate to ad#2
  → assistant `end_turn` line appends → onWaitEnd → finalize + adapter.clear() → item hides
  → impression POST /events (authenticated if token) → escrow debit / dev credit
```

## 8. Error handling / fail-safe (non-negotiable)
- Detection, render, clear already swallow host errors in `ClaudeCodeAdapter`.
- `ThinkingWaitSource` swallows all FS/parse/watcher errors; worst case = no ads, stock UI.
- `StatusBarSink` swallows render errors.
- Billing stays conservative (≤1 impression per ad-window after 5s; house ads never billed;
  under-bill rather than over-bill) — unchanged.
- Killswitch (`/config` `active=false`) → nothing shown, nothing billed — unchanged.

## 9. Testing (TDD; repo rule: 80% coverage, files <800 lines, fns <50 lines)
- `ThinkingWaitSource`: feed synthetic JSONL line events + fake clock → assert
  onWaitStart/onTick/onWaitEnd ordering, turn boundaries (prompt vs tool_result; end_turn),
  90s safety timeout, and that thrown FS/parse errors never propagate.
- `StatusBarSink`: fake item → assert text/show on write, hide on restore, click → openExternal
  with the current ad URL.
- `SessionLocator`: slug computation (Windows + POSIX paths), newest-file selection, missing dir.
- Wire-up: `ClaudeCodeAdapter` selected when `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` set; render
  reaches the sink; dispose tears everything down.

## 10. Out of scope (YAGNI)
- Codex / Gemini adapters (same pattern, separate effort).
- Real OAuth consent UI (dev paste-token flow stays).
- Marketplace packaging / publishing.
- Webview / rich (image) creative.

## 11. Acceptance criteria
1. With Claude Code running in the VS Code **extension** panel and a funded `claude-code-panel`
   campaign, a sponsored line appears in VS Code's status bar while Claude is thinking, is
   clickable (opens the advertiser URL), and disappears when Claude goes idle.
2. After ~5s visible, an impression is billed once (escrow debit + dev credit), verified via
   the dev dashboard — same loop as the CLI path.
3. The **terminal/CLI** path continues to work unchanged.
4. All new units have tests; existing tests stay green; nothing can throw into the editor.

---

## Addendum (2026-06-29) — structured brand creative

Extends the single-line creative into **brand-identity fields** so a brand's name + tagline,
color, and emoji render together. Additive and backward-compatible — the legacy `copy` stays.

**Schema (all optional/nullable):** `Campaign.headline` (≤20), `tagline` (≤40), `brandColor`
(`#RRGGBB`), `emoji` (single emoji). Added to `serveResponse` and the create/edit campaign
schemas in `@vibearning/shared`; one Prisma migration (`20260629000000_campaign_brand_fields`).

**Render** (`statusline/compose.ts`): `"{emoji} {Sponsored: }{headline} — {tagline} · {host}"`,
falling back to `copy` when `headline` is unset. Default cap raised 60→120 so the tagline stays
visible (the status bar auto-widens). `StatusBarSink.write()` applies `brandColor` to
`item.color`; `restore()` clears it.

**`copy` derivation:** the portal sends only the structured fields; the **server** derives the
legacy `copy = deriveCopy(headline, tagline)` (shared util, clamped to 60). `copy` is now optional
on create (refine: `copy || headline`), so a short brand name can't 400.

**Validation/hardening:** `emoji` must be exactly one emoji grapheme (rejects plain text);
`brandColor` is `#RRGGBB`; the portal warns (doesn't mangle) on extreme-luminance colors.

**Portal:** the campaign create/edit forms collect emoji + brand name + tagline + color with a
live preview; the campaign list and the admin moderation queue show the tinted brand preview.

**Acceptance (added):** brand fields round-trip campaign→`/serve`→wire (e2e); the status-bar line
shows emoji + headline — tagline tinted by `brandColor`, reverting to the un-tinted `✓ Ad shown`
badge on idle.
