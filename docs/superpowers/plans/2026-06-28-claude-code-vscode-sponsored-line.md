# In-editor sponsored line for Claude Code (VS Code) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the vibearning sponsored line in VS Code's status bar while Claude Code works in the editor panel, billing one impression per ad-window — reusing the existing Orchestrator/billing loop, leaving the terminal/CLI path unchanged.

**Architecture:** Fill the two no-op seams of the existing `ClaudeCodeAdapter`: a `WaitSource` that detects "thinking" by watching the Claude session transcript (`~/.claude/projects/**/*.jsonl`), and a `StatusSink` that renders into a VS Code `StatusBarItem`. Wire them in `extension.ts`, selecting the in-editor adapter when the Claude Code extension is installed (env-var detection does NOT fire in the extension host). The in-editor adapter serves the `claude-code-panel` surface (distinct from `claude-code-terminal`).

**Tech Stack:** TypeScript, VS Code extension API (`createStatusBarItem`, `createFileSystemWatcher` + `RelativePattern`, `extensions.getExtension`, `env.openExternal`), Vitest, esbuild. API/seed in Node + Prisma + Redis.

**Branch:** `feat/cc-vscode-sponsored-line` (already created).

**Working dir for all `pnpm`/`vitest` commands:** `apps/extension` unless noted. Run tests with `pnpm --filter @vibearning/extension test` (or `npx vitest run <file>` inside `apps/extension`).

---

## File Structure

**Create:**
- `apps/extension/src/host/sessionLocator.ts` — pure: workspace dir → Claude project slug → newest `*.jsonl`.
- `apps/extension/src/host/sessionLocator.test.ts`
- `apps/extension/src/host/thinkingWaitSource.ts` — pure state machine implementing `WaitSource` from transcript events.
- `apps/extension/src/host/thinkingWaitSource.test.ts`
- `apps/extension/src/host/statusBarSink.ts` — `StatusSink` backed by a `StatusBarItem`.
- `apps/extension/src/host/statusBarSink.test.ts`

**Modify:**
- `apps/extension/src/adapters/claudeCode.ts` — `StatusSink.write(line, url?)`; `render` passes `ad.url`; `surface = "claude-code-panel"`.
- `apps/extension/src/adapters/claudeCode.test.ts` — surface assertions + a url-passthrough test.
- `apps/extension/src/adapters/registry.test.ts` — surface assertions (lines 22, 34).
- `apps/extension/src/host/extension.ts` — wire ad item, open command, production wait-source deps, adapter selection by extension presence, token fallback.
- `apps/api/scripts/seed.mjs` — house ad on `claude-code-panel`.
- `apps/api/scripts/seed-demo.mjs` — funded demo campaign on `claude-code-panel`.

**Do NOT touch (terminal/CLI path must stay `claude-code-terminal`):** `statusline/*`, `surface.ts`, `mockAdapter.ts`, `orchestrator.test.ts`, `core/orchestrator.ts`, `core/viewTracker.ts`, `core/apiClient.ts`.

---

## Task 1: Adapter surface → panel + `StatusSink.write(line, url)`

**Files:**
- Modify: `apps/extension/src/adapters/claudeCode.ts`
- Test: `apps/extension/src/adapters/claudeCode.test.ts`
- Test: `apps/extension/src/adapters/registry.test.ts`

- [ ] **Step 1: Update the existing surface assertions to expect the panel surface (RED)**

In `apps/extension/src/adapters/claudeCode.test.ts`:
- Line ~34-35: change to
```ts
  it("exposes the claude-code-panel surface", () => {
    expect(new ClaudeCodeAdapter().surface).toBe("claude-code-panel");
  });
```
- Line ~140: change to
```ts
    expect(api.serveMany).toHaveBeenCalledWith("claude-code-panel", 3);
```
- Line ~146: change the `surface` field to
```ts
      expect.objectContaining({ campaignId: "c1", type: "impression", visibleMs: 6000, surface: "claude-code-panel" }),
```

In `apps/extension/src/adapters/registry.test.ts`:
- Line ~22: change to
```ts
      ["claude-code-panel", "codex-panel", "gemini-cli-terminal"],
```
- Line ~34: change to
```ts
    expect(firstAvailable(fallback).surface).toBe("claude-code-panel");
```

- [ ] **Step 2: Add a test that `render` passes the ad URL to the sink (RED)**

Append inside the `describe("ClaudeCodeAdapter", ...)` block in `claudeCode.test.ts`:
```ts
  it("passes the ad url to the sink so it can be opened on click", () => {
    let gotUrl: string | undefined;
    const sink: StatusSink = { write: (_line, url) => { gotUrl = url; }, restore: () => {} };
    new ClaudeCodeAdapter({ sink }).render(paidAd);
    expect(gotUrl).toBe("https://turbo.dev");
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/extension && npx vitest run src/adapters/claudeCode.test.ts src/adapters/registry.test.ts`
Expected: FAIL — surface mismatches (`claude-code-terminal` received) and `gotUrl` undefined (TS may also error: `write` takes 1 arg).

- [ ] **Step 4: Update the adapter — interface, surface, render**

In `apps/extension/src/adapters/claudeCode.ts`:
- Change the `StatusSink` interface `write` signature:
```ts
export interface StatusSink {
  /** Render a single status line (the composed sponsored text). `url` is the ad's click target. */
  write(line: string, url?: string): void;
  /** Restore the agent's own status line (stop showing our text). */
  restore(): void;
}
```
- Change the surface field (line ~55):
```ts
  readonly surface = "claude-code-panel";
```
- In `render(ad)`, pass the URL (the line currently reads `if (line) this.sink.write(line);`):
```ts
      if (line) this.sink.write(line, ad.url);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/extension && npx vitest run src/adapters/claudeCode.test.ts src/adapters/registry.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Run the full extension suite to confirm nothing else regressed**

Run: `pnpm --filter @vibearning/extension test`
Expected: PASS. (CLI/terminal tests still assert `claude-code-terminal` — unchanged and green.)

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/adapters/claudeCode.ts apps/extension/src/adapters/claudeCode.test.ts apps/extension/src/adapters/registry.test.ts
git commit -m "feat(ext): in-editor adapter serves claude-code-panel; StatusSink carries ad url"
```

---

## Task 2: `SessionLocator` — find the active transcript

**Files:**
- Create: `apps/extension/src/host/sessionLocator.ts`
- Test: `apps/extension/src/host/sessionLocator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/src/host/sessionLocator.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { projectSlug, findNewestTranscript, type LocatorFs } from "./sessionLocator";

describe("projectSlug", () => {
  it("replaces non-alphanumerics with dashes (Windows path)", () => {
    expect(projectSlug("c:\\Users\\dev\\Desktop\\vibe-earning.ai"))
      .toBe("c--Users-dev-Desktop-vibe-earning-ai");
  });
  it("replaces non-alphanumerics with dashes (POSIX path)", () => {
    expect(projectSlug("/home/dev/my.proj")).toBe("-home-dev-my-proj");
  });
});

function fakeFs(layout: Record<string, { name: string; mtimeMs: number }[]>): LocatorFs {
  return {
    homedir: () => "/home/dev",
    listJsonl: (dir) => layout[dir] ?? [],
    listDirs: (dir) =>
      dir.endsWith("projects")
        ? Object.keys(layout).map((d) => d.split("/").pop() as string)
        : [],
  };
}

describe("findNewestTranscript", () => {
  it("returns the newest jsonl in the exact slug dir", () => {
    const slug = projectSlug("/work/proj"); // -work-proj
    const dir = `/home/dev/.claude/projects/${slug}`;
    const fs = fakeFs({ [dir]: [
      { name: "old.jsonl", mtimeMs: 100 },
      { name: "new.jsonl", mtimeMs: 200 },
    ]});
    expect(findNewestTranscript("/work/proj", fs)).toBe(`${dir}/new.jsonl`);
  });

  it("falls back to the globally-newest jsonl when the slug dir is empty", () => {
    const other = "/home/dev/.claude/projects/-other-proj";
    const fs = fakeFs({ [other]: [{ name: "s.jsonl", mtimeMs: 500 }] });
    expect(findNewestTranscript("/work/proj", fs)).toBe(`${other}/s.jsonl`);
  });

  it("returns null when there are no transcripts anywhere", () => {
    expect(findNewestTranscript("/work/proj", fakeFs({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && npx vitest run src/host/sessionLocator.test.ts`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Implement `sessionLocator.ts`**

Create `apps/extension/src/host/sessionLocator.ts`:
```ts
import { join } from "node:path";

/** Filesystem facade (injected so the locator is unit-testable without real disk). */
export interface LocatorFs {
  homedir(): string;
  /** `*.jsonl` entries (name + mtimeMs) directly in `dir`; [] if the dir is missing. */
  listJsonl(dir: string): { name: string; mtimeMs: number }[];
  /** Subdirectory names directly in `dir`; [] if the dir is missing. */
  listDirs(dir: string): string[];
}

/**
 * Claude Code names each project's transcript folder after the cwd with every
 * non-alphanumeric character replaced by a dash, e.g.
 * `c:\\Users\\dev\\app.ts` -> `c--Users-dev-app-ts`.
 */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function newestIn(dir: string, fs: LocatorFs): { path: string; mtimeMs: number } | null {
  let best: { path: string; mtimeMs: number } | null = null;
  for (const f of fs.listJsonl(dir)) {
    if (!best || f.mtimeMs > best.mtimeMs) best = { path: join(dir, f.name), mtimeMs: f.mtimeMs };
  }
  return best;
}

/**
 * Newest transcript for `cwd`: prefer the exact slug dir; if it has none, fall back
 * to the globally-newest transcript across all project dirs (robust to slug drift).
 */
export function findNewestTranscript(cwd: string, fs: LocatorFs): string | null {
  const projects = join(fs.homedir(), ".claude", "projects");
  const direct = newestIn(join(projects, projectSlug(cwd)), fs);
  if (direct) return direct.path;

  let best: { path: string; mtimeMs: number } | null = null;
  for (const sub of fs.listDirs(projects)) {
    const cand = newestIn(join(projects, sub), fs);
    if (cand && (!best || cand.mtimeMs > best.mtimeMs)) best = cand;
  }
  return best?.path ?? null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && npx vitest run src/host/sessionLocator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/host/sessionLocator.ts apps/extension/src/host/sessionLocator.test.ts
git commit -m "feat(ext): SessionLocator resolves the active Claude transcript file"
```

---

## Task 3: `ThinkingWaitSource` — detect thinking windows

**Files:**
- Create: `apps/extension/src/host/thinkingWaitSource.ts`
- Test: `apps/extension/src/host/thinkingWaitSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/src/host/thinkingWaitSource.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createThinkingWaitSource, type TranscriptLine } from "./thinkingWaitSource";
import type { WaitHandlers } from "../core/adapter";

const prompt: TranscriptLine = { type: "user", message: { content: "do a thing" } };
const toolResult: TranscriptLine = { type: "user", message: { content: [{ type: "tool_result" }] } };
const endTurn: TranscriptLine = { type: "assistant", message: { stop_reason: "end_turn" } };
const midTurn: TranscriptLine = { type: "assistant", message: { stop_reason: "tool_use" } };

function setup(opts: { lines?: TranscriptLine[] } = {}) {
  let onChange: () => void = () => {};
  let nextLine: TranscriptLine | null = null;
  let t = 0;
  const handlers: WaitHandlers = { onWaitStart: vi.fn(), onWaitEnd: vi.fn(), onTick: vi.fn() };
  const watchDispose = vi.fn();
  const source = createThinkingWaitSource({
    watch: (cb) => { onChange = cb; return watchDispose; },
    readLastLine: () => nextLine,
    now: () => t,
  });
  const dispose = source(handlers);
  return {
    handlers, watchDispose, dispose,
    emit: (line: TranscriptLine | null) => { nextLine = line; onChange(); },
    advance: (ms: number) => { t += ms; },
  };
}

describe("createThinkingWaitSource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires onWaitStart when a real user prompt is appended", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    expect(handlers.onWaitStart).toHaveBeenCalledOnce();
  });

  it("does NOT treat a tool_result as a new turn start", () => {
    const { handlers, emit } = setup();
    emit(toolResult);
    expect(handlers.onWaitStart).not.toHaveBeenCalled();
  });

  it("does not start a second turn while already thinking", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(prompt);
    expect(handlers.onWaitStart).toHaveBeenCalledOnce();
  });

  it("fires onWaitEnd on an assistant end_turn line", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(endTurn);
    expect(handlers.onWaitEnd).toHaveBeenCalledOnce();
  });

  it("fires onTick on the interval while thinking", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    vi.advanceTimersByTime(3000); // 3 ticks at 1s
    expect((handlers.onTick as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("stops ticking after the turn ends", () => {
    const { handlers, emit } = setup();
    emit(prompt);
    emit(endTurn);
    (handlers.onTick as ReturnType<typeof vi.fn>).mockClear();
    vi.advanceTimersByTime(3000);
    expect(handlers.onTick).not.toHaveBeenCalled();
  });

  it("force-ends a stuck turn after the idle timeout", () => {
    const { handlers, emit, advance } = setup();
    emit(prompt);
    advance(91_000);             // clock jumps past 90s with no new activity
    vi.advanceTimersByTime(1000); // next tick observes the gap and ends
    expect(handlers.onWaitEnd).toHaveBeenCalledOnce();
  });

  it("swallows a throwing readLastLine (never breaks the editor)", () => {
    let onChange: () => void = () => {};
    const source = createThinkingWaitSource({
      watch: (cb) => { onChange = cb; return () => {}; },
      readLastLine: () => { throw new Error("fs blew up"); },
      now: () => 0,
    });
    source({ onWaitStart: vi.fn(), onWaitEnd: vi.fn(), onTick: vi.fn() });
    expect(() => onChange()).not.toThrow();
  });

  it("dispose tears down the watcher and timers", () => {
    const { watchDispose, dispose, handlers, emit } = setup();
    emit(prompt);
    dispose();
    expect(watchDispose).toHaveBeenCalledOnce();
    (handlers.onTick as ReturnType<typeof vi.fn>).mockClear();
    vi.advanceTimersByTime(3000);
    expect(handlers.onTick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && npx vitest run src/host/thinkingWaitSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `thinkingWaitSource.ts`**

Create `apps/extension/src/host/thinkingWaitSource.ts`:
```ts
import type { WaitSource } from "../adapters/claudeCode";
import type { WaitHandlers } from "../core/adapter";

/** The subset of a transcript JSONL line we care about. */
export interface TranscriptLine {
  type?: string;
  message?: { content?: unknown; stop_reason?: string | null };
}

export interface ThinkingDeps {
  /** Subscribe to transcript changes; return a dispose. Called once per WaitSource. */
  watch(onChange: () => void): () => void;
  /** Parse the newest transcript's last line (null on any error/empty). */
  readLastLine(): TranscriptLine | null;
  now(): number;
  /** Tick cadence while thinking (default 1000ms). */
  tickMs?: number;
  /** Force-end a turn after this much inactivity (default 90000ms). */
  idleTimeoutMs?: number;
}

function isPrompt(line: TranscriptLine): boolean {
  return line.type === "user" && typeof line.message?.content === "string";
}
function isEndTurn(line: TranscriptLine): boolean {
  return line.type === "assistant" && line.message?.stop_reason === "end_turn";
}

/**
 * A WaitSource that infers Claude Code's "thinking" window from its session transcript:
 * a real user prompt opens the window; an assistant `end_turn` (or an idle-timeout) closes it.
 * The window spans the whole request→response, including tool-call gaps. Fail-safe: any
 * read/parse error is swallowed so a broken host can never break the editor.
 */
export function createThinkingWaitSource(deps: ThinkingDeps): WaitSource {
  const tickMs = deps.tickMs ?? 1000;
  const idleMs = deps.idleTimeoutMs ?? 90_000;

  return (handlers: WaitHandlers) => {
    let thinking = false;
    let lastActivity = deps.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

    const endTurn = () => {
      if (!thinking) return;
      thinking = false;
      stopTimer();
      try { handlers.onWaitEnd(); } catch { /* never break the editor */ }
    };

    const startTurn = () => {
      if (thinking) return;
      thinking = true;
      lastActivity = deps.now();
      try { handlers.onWaitStart(); } catch { /* never break the editor */ }
      timer = setInterval(() => {
        if (!thinking) return;
        if (deps.now() - lastActivity > idleMs) { endTurn(); return; }
        try { handlers.onTick?.(); } catch { /* swallow */ }
      }, tickMs);
    };

    const onChange = () => {
      let line: TranscriptLine | null = null;
      try { line = deps.readLastLine(); } catch { line = null; }
      if (!line) return;
      if (isPrompt(line)) { startTurn(); return; }
      if (thinking) lastActivity = deps.now();
      if (isEndTurn(line)) endTurn();
    };

    let disposeWatch: () => void = () => {};
    try { disposeWatch = deps.watch(onChange); } catch { disposeWatch = () => {}; }

    return () => {
      stopTimer();
      try { disposeWatch(); } catch { /* swallow */ }
    };
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && npx vitest run src/host/thinkingWaitSource.test.ts`
Expected: PASS (all 9).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/host/thinkingWaitSource.ts apps/extension/src/host/thinkingWaitSource.test.ts
git commit -m "feat(ext): ThinkingWaitSource detects thinking windows from the transcript"
```

---

## Task 4: `StatusBarSink` — render to the status bar

**Files:**
- Create: `apps/extension/src/host/statusBarSink.ts`
- Test: `apps/extension/src/host/statusBarSink.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/src/host/statusBarSink.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { StatusBarSink, type StatusItemLike } from "./statusBarSink";

function fakeItem() {
  const item: StatusItemLike & { shown: number; hidden: number } = {
    text: "", shown: 0, hidden: 0,
    show() { this.shown += 1; },
    hide() { this.hidden += 1; },
  };
  return item;
}

describe("StatusBarSink", () => {
  it("write sets sparkle-prefixed text, shows the item, and tracks the url", () => {
    const item = fakeItem();
    const sink = new StatusBarSink(item);
    sink.write("Sponsored: Acme · acme.dev", "https://acme.dev");
    expect(item.text).toBe("$(sparkle) Sponsored: Acme · acme.dev");
    expect(item.shown).toBe(1);
    expect(sink.currentUrl()).toBe("https://acme.dev");
  });

  it("restore hides the item", () => {
    const item = fakeItem();
    const sink = new StatusBarSink(item);
    sink.write("x", "https://x.dev");
    sink.restore();
    expect(item.hidden).toBe(1);
  });

  it("write swallows a throwing item (fail-safe)", () => {
    const item: StatusItemLike = {
      text: "",
      show() { throw new Error("host down"); },
      hide() {},
    };
    const sink = new StatusBarSink(item);
    expect(() => sink.write("x", "https://x.dev")).not.toThrow();
  });

  it("restore swallows a throwing item (fail-safe)", () => {
    const item: StatusItemLike = {
      text: "",
      show() {},
      hide() { throw new Error("host down"); },
    };
    const sink = new StatusBarSink(item);
    expect(() => sink.restore()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/extension && npx vitest run src/host/statusBarSink.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `statusBarSink.ts`**

Create `apps/extension/src/host/statusBarSink.ts`:
```ts
import type { StatusSink } from "../adapters/claudeCode";

/** Minimal slice of vscode.StatusBarItem we use (so tests need no vscode). */
export interface StatusItemLike {
  text: string;
  show(): void;
  hide(): void;
}

/**
 * Renders the composed sponsored line into a VS Code status bar item, and remembers the
 * current ad URL so a click command can open it. Fail-safe: never throws into the editor.
 */
export class StatusBarSink implements StatusSink {
  private url: string | undefined;

  constructor(private readonly item: StatusItemLike) {}

  /** The URL of the ad currently shown (for the click command). */
  currentUrl(): string | undefined {
    return this.url;
  }

  write(line: string, url?: string): void {
    try {
      this.url = url;
      this.item.text = `$(sparkle) ${line}`;
      this.item.show();
    } catch {
      /* never break the editor over a render failure */
    }
  }

  restore(): void {
    try {
      this.item.hide();
    } catch {
      /* best-effort */
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/extension && npx vitest run src/host/statusBarSink.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/host/statusBarSink.ts apps/extension/src/host/statusBarSink.test.ts
git commit -m "feat(ext): StatusBarSink renders the sponsored line + tracks click url"
```

---

## Task 5: Wire it all into `extension.ts`

**Files:**
- Modify: `apps/extension/src/host/extension.ts`

No new unit test (this is the composition root; logic lives in the tested units). Verified by build + the manual run in Task 7.

- [ ] **Step 1: Add imports**

At the top of `apps/extension/src/host/extension.ts`, add after the existing imports:
```ts
import * as os from "node:os";
import * as fs from "node:fs";
import { join } from "node:path";
import type { SpinnerAdapter } from "../core/adapter";
import { ClaudeCodeAdapter } from "../adapters/claudeCode";
import { StatusBarSink } from "./statusBarSink";
import { createThinkingWaitSource, type TranscriptLine } from "./thinkingWaitSource";
import { findNewestTranscript, type LocatorFs } from "./sessionLocator";
import { loadToken } from "../statusline/store";
```

- [ ] **Step 2: Add the token fallback**

Change the `ApiClient` construction (currently `() => cachedToken`) to fall back to the CLI token file:
```ts
  const api = new ApiClient(API_BASE, fetch, () => cachedToken ?? loadToken());
```

- [ ] **Step 3: Create the sponsored-line status item + open command**

Immediately after the existing earnings `status` item block (`status.show();`), add:
```ts
  // The sponsored line gets its OWN status bar item, shown only while Claude is thinking.
  const adItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  adItem.tooltip = "Sponsored via vibearning — click to open. You earn while your AI works.";
  adItem.command = "vibearning.openSponsor";
  const sink = new StatusBarSink(adItem);

  const openSponsor = vscode.commands.registerCommand("vibearning.openSponsor", () => {
    const url = sink.currentUrl();
    if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
  });
```

- [ ] **Step 4: Replace adapter selection with the in-editor wiring**

Replace these two lines:
```ts
  const mock = new MockAdapter();
  const adapter = firstAvailable(mock);
```
with:
```ts
  const mock = new MockAdapter();
  const adapter: SpinnerAdapter = buildInEditorAdapter(sink) ?? firstAvailable(mock);
```

- [ ] **Step 5: Add the builder + production wait-source deps (module-scope helpers)**

Add these functions at the bottom of the file, above `export function deactivate()`:
```ts
/** True if Anthropic's Claude Code extension is installed (env vars don't reach the ext host). */
function claudeCodePresent(): boolean {
  try {
    return Boolean(
      vscode.extensions.getExtension("Anthropic.claude-code") ||
        vscode.extensions.getExtension("anthropic.claude-code"),
    );
  } catch {
    return false;
  }
}

const locatorFs: LocatorFs = {
  homedir: () => os.homedir(),
  listJsonl: (dir) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((name) => ({ name, mtimeMs: fs.statSync(join(dir, name)).mtimeMs }));
    } catch {
      return [];
    }
  },
  listDirs: (dir) => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      return [];
    }
  },
};

function readLastLine(workspaceDir: string): TranscriptLine | null {
  const file = findNewestTranscript(workspaceDir, locatorFs);
  if (!file) return null;
  try {
    const data = fs.readFileSync(file, "utf8");
    const body = data.endsWith("\n") ? data.slice(0, -1) : data;
    const nl = body.lastIndexOf("\n");
    const last = (nl >= 0 ? body.slice(nl + 1) : body).trim();
    return last ? (JSON.parse(last) as TranscriptLine) : null;
  } catch {
    return null;
  }
}

/**
 * Build the in-editor Claude Code adapter, or null if we shouldn't use it (no workspace,
 * or Claude Code extension not installed) — caller falls back to the dev MockAdapter.
 */
function buildInEditorAdapter(sink: StatusBarSink): SpinnerAdapter | null {
  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceDir || !claudeCodePresent()) return null;

  const watch = (onChange: () => void): (() => void) => {
    try {
      const base = vscode.Uri.file(join(os.homedir(), ".claude", "projects"));
      // Recursive: catch the active session regardless of the exact slug dir. Duplicate
      // events are harmless (onChange is idempotent).
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(base, "**/*.jsonl"),
        false,
        false,
        true,
      );
      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      return () => watcher.dispose();
    } catch {
      return () => {};
    }
  };

  const waitSource = createThinkingWaitSource({
    watch,
    readLastLine: () => readLastLine(workspaceDir),
    now: () => Date.now(),
  });
  // We already gated on claudeCodePresent(); force detect=true so the adapter is selected.
  return new ClaudeCodeAdapter({ detect: () => true, waitSource, sink });
}
```

- [ ] **Step 6: Register the new command in subscriptions**

Add `adItem` and `openSponsor` to the final `context.subscriptions.push(...)` call:
```ts
  context.subscriptions.push(status, adItem, openSponsor, focusSub, tokenSub, simulate, endWait, signIn, { dispose: () => { clearInterval(timer); orch.stop(); } });
```

- [ ] **Step 7: Add the command to `package.json` contributes**

In `apps/extension/package.json`, add to `contributes.commands`:
```json
      { "command": "vibearning.openSponsor", "title": "vibearning: Open the current sponsor" }
```

- [ ] **Step 8: Typecheck + build**

Run: `cd apps/extension && pnpm lint && pnpm build`
Expected: no TS errors; `dist/extension.js` rebuilt.

- [ ] **Step 9: Run the full extension suite**

Run: `pnpm --filter @vibearning/extension test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/extension/src/host/extension.ts apps/extension/package.json
git commit -m "feat(ext): wire in-editor sponsored line (status bar + transcript watch + token fallback)"
```

---

## Task 6: Seed `claude-code-panel` inventory

**Files:**
- Modify: `apps/api/scripts/seed.mjs`
- Modify: `apps/api/scripts/seed-demo.mjs`

- [ ] **Step 1: Add a panel house ad**

In `apps/api/scripts/seed.mjs`, add to the `HOUSE_ADS` array (use a DISTINCT copy — the seeder dedupes by copy):
```js
  { copy: "Earn while Claude works — vibearning.in", url: "https://vibearning.in", surface: "claude-code-panel" },
```

- [ ] **Step 2: Add a funded panel campaign to the demo seeder**

In `apps/api/scripts/seed-demo.mjs`, replace the single-surface constants + `main()` body so it seeds both surfaces. Change the constants block to:
```js
const DEMOS = [
  { surface: "claude-code-terminal", copy: "Acme DB — serverless Postgres for devs. Try free →", url: "https://example.com/acme-db" },
  { surface: "claude-code-panel",    copy: "Acme DB (editor) — serverless Postgres. Try free →", url: "https://example.com/acme-db" },
];
const BID_AMOUNT = 50_000;     // price = floor(amount/1000) = 50 paise per impression
const ESCROW_PAISE = 5_000_000; // ₹50,000 of dummy budget per campaign
```
and replace `main()` with a loop over `DEMOS`:
```js
async function seedOne({ surface, copy, url }) {
  let advertiser = await prisma.account.findFirst({ where: { email: "demo-advertiser@vibearning.test", type: "advertiser" } });
  if (!advertiser) {
    advertiser = await prisma.account.create({ data: { type: "advertiser", email: "demo-advertiser@vibearning.test", emailVerified: true } });
    console.log(`[demo] created advertiser ${advertiser.id}`);
  }

  let campaign = await prisma.campaign.findFirst({ where: { copy, isHouseAd: false } });
  if (!campaign) {
    campaign = await prisma.campaign.create({ data: { copy, url, isHouseAd: false, status: "active", advertiserId: advertiser.id } });
    console.log(`[demo] created campaign ${campaign.id} (${surface})`);
  }

  const existingBid = await prisma.bid.findFirst({ where: { campaignId: campaign.id, surface, status: "active" } });
  if (!existingBid) {
    await prisma.bid.create({ data: { campaignId: campaign.id, surface, amount: BID_AMOUNT, status: "active" } });
    console.log(`[demo] created bid amount=${BID_AMOUNT} on ${surface}`);
  }

  const fundEventId = `demo-fund-v1:${campaign.id}`;
  await prisma.ledgerEntry.createMany({
    data: [
      { eventId: fundEventId, account: "cash:platform", direction: "debit", amount: ESCROW_PAISE },
      { eventId: fundEventId, account: `escrow:campaign:${campaign.id}`, direction: "credit", amount: ESCROW_PAISE },
    ],
    skipDuplicates: true,
  });

  await redis.zadd(`rank:${surface}`, BID_AMOUNT, campaign.id);
  console.log(`[demo] DONE ${surface} campaignId=${campaign.id}`);
}

async function main() {
  for (const demo of DEMOS) await seedOne(demo);
}
```
(Keep the existing imports, `prisma`/`redis` setup, and the `main().catch(...).finally(...)` footer.)

- [ ] **Step 3: Run the seeders against the running DB**

Ensure Postgres/Redis/API are up (Task 7 covers starting them if not). Then:
```bash
cd <repo root>
SEED_ADMIN_EMAIL=admin@vibearning.test SEED_ADMIN_PASSWORD=admin12345 pnpm --filter @vibearning/api seed
pnpm --filter @vibearning/api exec node scripts/seed-demo.mjs
```
Expected: log lines creating a `claude-code-panel` house ad and a funded `claude-code-panel` campaign.

- [ ] **Step 4: Verify the panel surface serves an ad**

Run: `curl "http://localhost:3000/serve?surface=claude-code-panel&count=3"`
Expected: JSON whose top `ad.copy` is the Acme DB (editor) line, `isHouseAd:false`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/seed.mjs apps/api/scripts/seed-demo.mjs
git commit -m "feat(api): seed house + funded inventory on claude-code-panel"
```

---

## Task 7: Manual end-to-end verification (in the VS Code extension)

**No code.** Confirms the in-editor path renders + bills. (Cannot run in CI — needs the live runtime.)

- [ ] **Step 1: Ensure the stack is up**

```bash
cd <repo root>
docker compose up -d                       # Postgres :5433, Redis :6379
pnpm --filter @vibearning/api dev                 # API :3000 (leave running)
```
Confirm: `curl "http://localhost:3000/serve?surface=claude-code-panel&count=1"` returns a funded ad.

- [ ] **Step 2: Build the extension**

```bash
pnpm --filter @vibearning/extension build
```

- [ ] **Step 3: Launch the dev extension**

Open `apps/extension` (or the repo) in VS Code and press **F5** to start an **Extension Development Host** window (loads this dev build). If there's no launch config, add the standard "Run Extension" config, or package + install: `npx vsce package` then install the `.vsix`.

- [ ] **Step 4: Use Claude Code in that window**

In the Extension Development Host window, open this project, open the Claude Code panel, and send a prompt so Claude starts working.

Expected:
- While Claude is thinking, a status bar item appears (bottom-right): `$(sparkle) Sponsored: Acme DB (editor) …`.
- Clicking it opens `https://example.com/acme-db` in the browser.
- When Claude finishes, the item disappears.

- [ ] **Step 5: Verify billing**

After the line has been visible ≥5s during a turn:
```bash
TOKEN=$(cat ~/.vibearning/token)
curl -s "http://localhost:3000/ledger/me/stats" -H "authorization: Bearer $TOKEN"
```
Expected: `validImpressions` / `lifetimePaise` increased (panel impressions now credited to the demo dev). The CLI/terminal path still works independently.

- [ ] **Step 6: Final commit (docs/notes if any)**

```bash
git add -A
git commit -m "docs: verify in-editor sponsored line end-to-end" --allow-empty
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** render surface (Task 4/5), detection via transcript watch (Task 2/3/5), `claude-code-panel` surface (Task 1/6), token fallback (Task 5), demo inventory (Task 6), fail-safe (swallow tests in Tasks 1/3/4), reused billing loop (unchanged), tests for every new unit (Tasks 2/3/4), terminal path untouched (explicit "do not touch" list).
- **Detection in the extension host:** spec §3 assumed `WaitSource` binds to "the live runtime"; this plan pins the concrete detection (transcript watch) and corrects the presence check to `extensions.getExtension` because `CLAUDECODE` env is NOT set in the extension host.
- **Type consistency:** `StatusSink.write(line, url?)`, `StatusItemLike{text,show,hide}`, `ThinkingDeps{watch,readLastLine,now,tickMs?,idleTimeoutMs?}`, `TranscriptLine{type?,message?{content?,stop_reason?}}`, `LocatorFs{homedir,listJsonl,listDirs}` are used identically across tasks.
