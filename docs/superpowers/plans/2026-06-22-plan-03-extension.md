# Plan 03 — VS Code Extension (core pipeline + adapter seam) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `apps/extension` VS Code extension whose **core pipeline is fully unit-tested** — detect a wait-state → fetch an ad from `/serve` → render it → track on-screen time → emit an impression to `/events` — behind a `SpinnerAdapter` interface, with a working `MockAdapter` for end-to-end manual verification and stubbed real adapters.

**Architecture:** Strict separation so logic is testable without the `vscode` runtime. **Pure modules** (no `vscode` import): `nonce`, `viewTracker`, `apiClient`, `killswitch`, `adapter` interface + `mockAdapter`, `orchestrator` — all vitest-tested with injected `fetch`/clock/fakes. **`vscode` host layer** (`extension.ts`, `secretStore.ts`) is thin, compile-checked only, with a manual test plan. Real adapters (`claude-code`, `codex`, `gemini-cli`) are interface-conformant stubs with TODO + manual-test notes.

**Tech Stack:** TypeScript, esbuild (bundle), vitest (pure core), `@types/vscode`, global `fetch` (VS Code's Node ≥18). Types reused from `@vibearning/shared`.

> **Prerequisites:** Plans 01–02 merged to `main`. `packages/shared` built. The extension talks to the api from Plan 01/02 (`/serve`, `/events`).

> **WHY this scope:** Real spinner injection depends on each agent's private/changing internals and cannot be reliably auto-tested. We test 100% of the logic that does not need a live agent, and isolate the vendor-specific injection into stubbed adapters that get a manual test plan. Real adapter implementation is a follow-up research+manual task, not this plan.

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §7.

---

## File Structure

```
apps/extension/
  package.json            # VS Code extension manifest + scripts
  tsconfig.json
  vitest.config.ts
  esbuild.mjs             # bundle for the extension host
  .vscodeignore
  src/
    core/                 # PURE — no `vscode` import, vitest-tested
      nonce.ts            + nonce.test.ts
      viewTracker.ts      + viewTracker.test.ts
      apiClient.ts        + apiClient.test.ts
      killswitch.ts       + killswitch.test.ts
      adapter.ts          # SpinnerAdapter interface + WaitHandlers
      mockAdapter.ts      + mockAdapter.test.ts
      orchestrator.ts     + orchestrator.test.ts
    adapters/             # real adapters — interface-conformant STUBS (manual-test)
      claudeCode.ts
      codex.ts
      geminiCli.ts
      registry.ts         + registry.test.ts
    host/                 # `vscode`-facing — compile-only, manual test plan
      extension.ts
      secretStore.ts
    MANUAL-TEST.md        # how to verify in the Extension Dev Host
```

---

## Task 1: Extension scaffold

**Files:** Create `apps/extension/{package.json,tsconfig.json,vitest.config.ts,esbuild.mjs,.vscodeignore}`

- [ ] **Step 1: `apps/extension/package.json`**

```json
{
  "name": "@vibearning/extension",
  "displayName": "vibearning",
  "version": "0.0.0",
  "private": true,
  "engines": { "vscode": "^1.90.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "vibearning.simulateWait", "title": "vibearning: Simulate Wait-State (dev)" },
      { "command": "vibearning.endWait", "title": "vibearning: End Wait-State (dev)" }
    ]
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@vibearning/shared": "workspace:*",
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `apps/extension/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vscode"]
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: `apps/extension/vitest.config.ts`** (only the pure core is tested)

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 4: `apps/extension/esbuild.mjs`** (bundle; `vscode` is external)

```js
import { build } from "esbuild";
await build({
  entryPoints: ["src/host/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: true,
});
```

- [ ] **Step 5: `apps/extension/.vscodeignore`**

```
src/**
node_modules/**
*.test.ts
esbuild.mjs
tsconfig.json
vitest.config.ts
```

- [ ] **Step 6: Install + commit**

Run: `pnpm install`
Expected: `@vibearning/extension` deps resolve.

```bash
git add apps/extension/package.json apps/extension/tsconfig.json apps/extension/vitest.config.ts apps/extension/esbuild.mjs apps/extension/.vscodeignore pnpm-lock.yaml
git commit -m "chore(extension): scaffold VS Code extension package"
```

---

## Task 2: `nonce` (TDD)

**Files:** Create `src/core/nonce.ts`; Test `src/core/nonce.test.ts`

- [ ] **Step 1: Write the failing test — `src/core/nonce.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeNonce } from "./nonce";

describe("makeNonce", () => {
  it("is deterministic for the same wait-state", () => {
    expect(makeNonce("inst", "camp", 1000)).toBe(makeNonce("inst", "camp", 1000));
  });
  it("differs across wait-states", () => {
    expect(makeNonce("inst", "camp", 1000)).not.toBe(makeNonce("inst", "camp", 2000));
  });
  it("is at least 8 chars (api requires >=8)", () => {
    expect(makeNonce("i", "c", 1).length).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- nonce`
Expected: FAIL — cannot find `./nonce`.

- [ ] **Step 3: Implement `src/core/nonce.ts`**

```ts
/** Stable nonce per (install, campaign, wait-start). Lets the offline queue retry safely:
 *  the same wait-state always produces the same nonce, so the server dedupes replays. */
export function makeNonce(installId: string, campaignId: string, waitStartMs: number): string {
  return `kb_${installId}_${campaignId}_${waitStartMs}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- nonce`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/core/nonce.ts apps/extension/src/core/nonce.test.ts
git commit -m "feat(extension): stable per-wait-state nonce"
```

---

## Task 3: `ViewTracker` (TDD)

**Files:** Create `src/core/viewTracker.ts`; Test `src/core/viewTracker.test.ts`

- [ ] **Step 1: Write the failing test — `src/core/viewTracker.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ViewTracker } from "./viewTracker";

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("ViewTracker", () => {
  it("accumulates only while active", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(3000);
    vt.pause();        // not visible/focused
    c.advance(10000);  // should NOT count
    vt.resume();
    c.advance(2000);
    expect(vt.stop()).toBe(5000);
  });

  it("reports live visibleMs while running", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(1500);
    expect(vt.visibleMs).toBe(1500);
  });

  it("stop is idempotent and returns the final total", () => {
    const c = fakeClock();
    const vt = new ViewTracker(c.now);
    vt.start();
    c.advance(4000);
    expect(vt.stop()).toBe(4000);
    c.advance(9999);
    expect(vt.stop()).toBe(4000);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- viewTracker`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/viewTracker.ts`**

```ts
/** Accumulates on-screen time, counting only intervals where the ad is visible AND focused.
 *  `now` is injected for testability. */
export class ViewTracker {
  private accumulatedMs = 0;
  private activeSince: number | null = null;

  constructor(private readonly now: () => number) {}

  start(): void {
    this.accumulatedMs = 0;
    this.activeSince = this.now();
  }

  pause(): void {
    if (this.activeSince !== null) {
      this.accumulatedMs += this.now() - this.activeSince;
      this.activeSince = null;
    }
  }

  resume(): void {
    if (this.activeSince === null) this.activeSince = this.now();
  }

  stop(): number {
    this.pause();
    return this.accumulatedMs;
  }

  get visibleMs(): number {
    return this.accumulatedMs + (this.activeSince !== null ? this.now() - this.activeSince : 0);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- viewTracker`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/core/viewTracker.ts apps/extension/src/core/viewTracker.test.ts
git commit -m "feat(extension): view tracker (counts only visible+focused time)"
```

---

## Task 4: `ApiClient` — serve + events with offline queue (TDD)

**Files:** Create `src/core/apiClient.ts`; Test `src/core/apiClient.test.ts`

- [ ] **Step 1: Write the failing test — `src/core/apiClient.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./apiClient";

const ad = { adId: "a1", campaignId: "c1", copy: "Hi", url: "https://x.dev", iconUrl: null, isHouseAd: true };
const ev = { installId: "i", campaignId: "c1", surface: "codex-panel" as const, type: "impression" as const, nonce: "nonce123", visibleMs: 6000 };

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe("ApiClient", () => {
  it("serve() returns the ad from the response envelope", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ad }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.serve("codex-panel")).toEqual(ad);
    expect(fetchFn).toHaveBeenCalledWith("http://api/serve?surface=codex-panel", expect.anything());
  });

  it("serve() returns null when no inventory", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ad: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.serve("codex-panel")).toBeNull();
  });

  it("sendEvent() posts and returns true on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ deduped: false, valid: true, reason: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.sendEvent(ev)).toBe(true);
    expect(c.queueLength).toBe(0);
  });

  it("sendEvent() queues on network failure and flush retries", async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error("offline"))
                           .mockResolvedValue(jsonResponse({ deduped: false, valid: true, reason: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.sendEvent(ev)).toBe(false);
    expect(c.queueLength).toBe(1);
    await c.flushQueue();
    expect(c.queueLength).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- apiClient`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/apiClient.ts`**

```ts
import type { EventIngest, ServeResponse, Surface } from "@vibearning/shared";

export class ApiClient {
  private queue: EventIngest[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch,
    private readonly getToken: () => string | undefined = () => undefined,
  ) {}

  get queueLength(): number {
    return this.queue.length;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const token = this.getToken();
    if (token) h["authorization"] = `Bearer ${token}`;
    return h;
  }

  async serve(surface: Surface): Promise<ServeResponse | null> {
    const res = await this.fetchFn(`${this.baseUrl}/serve?surface=${surface}`, { headers: this.headers() });
    if (!res.ok) return null;
    const body = (await res.json()) as { ad: ServeResponse | null };
    return body.ad;
  }

  /** Returns true if delivered now; false if queued for later retry. Never throws on network error. */
  async sendEvent(event: EventIngest): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/events`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        this.queue.push(event);
        return false;
      }
      return true;
    } catch {
      this.queue.push(event);
      return false;
    }
  }

  async flushQueue(): Promise<void> {
    const pending = this.queue;
    this.queue = [];
    for (const event of pending) {
      const ok = await this.sendEvent(event);
      if (!ok) {
        // sendEvent re-queued it on failure; stop to preserve order and retry later.
        break;
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- apiClient`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/core/apiClient.ts apps/extension/src/core/apiClient.test.ts
git commit -m "feat(extension): api client (serve + events with offline queue + retry)"
```

---

## Task 5: `Killswitch` poller (TDD)

**Files:** Create `src/core/killswitch.ts`; Test `src/core/killswitch.test.ts`

- [ ] **Step 1: Write the failing test — `src/core/killswitch.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Killswitch } from "./killswitch";

const resp = (active: boolean) => ({ ok: true, json: async () => ({ active }) } as Response);

describe("Killswitch", () => {
  it("starts inactive", () => {
    const ks = new Killswitch("http://api/config", vi.fn() as unknown as typeof fetch);
    expect(ks.isActive()).toBe(false);
  });
  it("activates from a poll response", async () => {
    const ks = new Killswitch("http://api/config", vi.fn().mockResolvedValue(resp(true)) as unknown as typeof fetch);
    expect(await ks.poll()).toBe(true);
    expect(ks.isActive()).toBe(true);
  });
  it("keeps the last known state on poll error (fail-open to previous)", async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(resp(true)).mockRejectedValueOnce(new Error("net"));
    const ks = new Killswitch("http://api/config", fetchFn as unknown as typeof fetch);
    await ks.poll();          // → active true
    expect(await ks.poll()).toBe(true); // error → unchanged
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- killswitch`
Expected: FAIL.

- [ ] **Step 3: Implement `src/core/killswitch.ts`**

```ts
/** Polls a server flag; when active, the orchestrator serves no ads.
 *  On poll error keeps the last known state (a transient blip should not flip ads off/on). */
export class Killswitch {
  private active = false;

  constructor(private readonly url: string, private readonly fetchFn: typeof fetch) {}

  isActive(): boolean {
    return this.active;
  }

  async poll(): Promise<boolean> {
    try {
      const res = await this.fetchFn(this.url);
      if (res.ok) {
        const body = (await res.json()) as { active?: boolean };
        this.active = Boolean(body.active);
      }
    } catch {
      // keep last known state
    }
    return this.active;
  }
}
```

> **Note for Plan 09 (fraud/killswitch):** the api needs a `GET /config` (or `/killswitch`) endpoint returning `{ active: boolean }`. Until then the poller fails closed to `false` (ads on). Wire the real endpoint in Plan 09.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- killswitch`
Expected: PASS (3).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/core/killswitch.ts apps/extension/src/core/killswitch.test.ts
git commit -m "feat(extension): killswitch poller (keeps last state on error)"
```

---

## Task 6: `SpinnerAdapter` interface + `MockAdapter` + real-adapter stubs + registry (TDD)

**Files:** Create `src/core/adapter.ts`, `src/core/mockAdapter.ts`, `src/adapters/{claudeCode,codex,geminiCli,registry}.ts`; Test `src/core/mockAdapter.test.ts`, `src/adapters/registry.test.ts`

- [ ] **Step 1: Implement `src/core/adapter.ts`** (interface — no test needed)

```ts
import type { ServeResponse, Surface } from "@vibearning/shared";

export interface WaitHandlers {
  onWaitStart(): void;
  onWaitEnd(): void;
}

/** One per spinner surface. Implementations own the vendor-specific detection + rendering. */
export interface SpinnerAdapter {
  readonly surface: Surface;
  /** Is the target agent actually present in this environment? */
  isAvailable(): boolean;
  /** Begin watching for wait-states. Returns a dispose function. */
  start(handlers: WaitHandlers): () => void;
  /** Render the sponsored line. */
  render(ad: ServeResponse): void;
  /** Restore the original spinner content. */
  clear(): void;
}
```

- [ ] **Step 2: Write the failing test — `src/core/mockAdapter.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { MockAdapter } from "./mockAdapter";

describe("MockAdapter", () => {
  it("fires wait handlers on demand and records render/clear", () => {
    const a = new MockAdapter();
    const onWaitStart = vi.fn();
    const onWaitEnd = vi.fn();
    const dispose = a.start({ onWaitStart, onWaitEnd });

    a.fireWaitStart();
    expect(onWaitStart).toHaveBeenCalledOnce();

    a.render({ adId: "a", campaignId: "c", copy: "x", url: "https://x.dev", iconUrl: null, isHouseAd: true });
    expect(a.lastRendered?.campaignId).toBe("c");

    a.fireWaitEnd();
    expect(onWaitEnd).toHaveBeenCalledOnce();

    a.clear();
    expect(a.lastRendered).toBeNull();

    dispose(); // no throw
  });

  it("is always available", () => {
    expect(new MockAdapter().isAvailable()).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- mockAdapter`
Expected: FAIL.

- [ ] **Step 4: Implement `src/core/mockAdapter.ts`**

```ts
import type { ServeResponse } from "@vibearning/shared";
import type { SpinnerAdapter, WaitHandlers } from "./adapter";

/** Test/dev adapter. Lets a command or test drive fake wait-states so the full pipeline
 *  can be exercised end-to-end without a real agent. */
export class MockAdapter implements SpinnerAdapter {
  readonly surface = "claude-code-terminal";
  private handlers: WaitHandlers | null = null;
  lastRendered: ServeResponse | null = null;

  isAvailable(): boolean {
    return true;
  }

  start(handlers: WaitHandlers): () => void {
    this.handlers = handlers;
    return () => { this.handlers = null; };
  }

  render(ad: ServeResponse): void {
    this.lastRendered = ad;
  }

  clear(): void {
    this.lastRendered = null;
  }

  fireWaitStart(): void {
    this.handlers?.onWaitStart();
  }

  fireWaitEnd(): void {
    this.handlers?.onWaitEnd();
  }
}
```

- [ ] **Step 5: Implement the real-adapter STUBS** — `src/adapters/claudeCode.ts`, `codex.ts`, `geminiCli.ts`

> These are interface-conformant placeholders. The real detection/rendering is vendor-specific and MUST be verified manually against the live agent (see `MANUAL-TEST.md`). They no-op safely so the extension never breaks a host agent.

`src/adapters/claudeCode.ts`:
```ts
import type { ServeResponse } from "@vibearning/shared";
import type { SpinnerAdapter, WaitHandlers } from "../core/adapter";

/** STUB — real impl pending (Claude Code terminal status-line / spinner-verb hook).
 *  See MANUAL-TEST.md. Currently reports unavailable so it is never auto-selected. */
export class ClaudeCodeAdapter implements SpinnerAdapter {
  readonly surface = "claude-code-terminal";
  isAvailable(): boolean { return false; } // TODO: detect Claude Code
  start(_handlers: WaitHandlers): () => void { return () => {}; } // TODO: hook wait-states
  render(_ad: ServeResponse): void { /* TODO: write sponsored line */ }
  clear(): void { /* TODO: restore */ }
}
```

`src/adapters/codex.ts`:
```ts
import type { ServeResponse } from "@vibearning/shared";
import type { SpinnerAdapter, WaitHandlers } from "../core/adapter";

/** STUB — real impl pending (Codex panel thinking-shimmer). See MANUAL-TEST.md. */
export class CodexAdapter implements SpinnerAdapter {
  readonly surface = "codex-panel";
  isAvailable(): boolean { return false; }
  start(_handlers: WaitHandlers): () => void { return () => {}; }
  render(_ad: ServeResponse): void {}
  clear(): void {}
}
```

`src/adapters/geminiCli.ts`:
```ts
import type { ServeResponse } from "@vibearning/shared";
import type { SpinnerAdapter, WaitHandlers } from "../core/adapter";

/** STUB — real impl pending (Gemini CLI terminal spinner line). See MANUAL-TEST.md. */
export class GeminiCliAdapter implements SpinnerAdapter {
  readonly surface = "gemini-cli-terminal";
  isAvailable(): boolean { return false; }
  start(_handlers: WaitHandlers): () => void { return () => {}; }
  render(_ad: ServeResponse): void {}
  clear(): void {}
}
```

- [ ] **Step 6: Write the failing test — `src/adapters/registry.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { allAdapters, firstAvailable } from "./registry";
import { MockAdapter } from "../core/mockAdapter";

describe("adapter registry", () => {
  it("lists the three real adapters", () => {
    expect(allAdapters().map((a) => a.surface).sort()).toEqual(
      ["claude-code-terminal", "codex-panel", "gemini-cli-terminal"],
    );
  });
  it("falls back to a provided default when none are available", () => {
    const fallback = new MockAdapter();
    expect(firstAvailable(fallback)).toBe(fallback); // stubs are all unavailable for now
  });
});
```

- [ ] **Step 7: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- registry`
Expected: FAIL — cannot find `./registry`.

- [ ] **Step 8: Implement `src/adapters/registry.ts`**

```ts
import type { SpinnerAdapter } from "../core/adapter";
import { ClaudeCodeAdapter } from "./claudeCode";
import { CodexAdapter } from "./codex";
import { GeminiCliAdapter } from "./geminiCli";

export function allAdapters(): SpinnerAdapter[] {
  return [new ClaudeCodeAdapter(), new CodexAdapter(), new GeminiCliAdapter()];
}

/** First available real adapter, else the provided fallback (e.g. MockAdapter in dev). */
export function firstAvailable(fallback: SpinnerAdapter): SpinnerAdapter {
  return allAdapters().find((a) => a.isAvailable()) ?? fallback;
}
```

- [ ] **Step 9: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- "mockAdapter|registry"`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/extension/src/core/adapter.ts apps/extension/src/core/mockAdapter.ts apps/extension/src/core/mockAdapter.test.ts apps/extension/src/adapters
git commit -m "feat(extension): SpinnerAdapter seam, MockAdapter, real-adapter stubs, registry"
```

---

## Task 7: `Orchestrator` — the pipeline (TDD)

**Files:** Create `src/core/orchestrator.ts`; Test `src/core/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test — `src/core/orchestrator.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import { MockAdapter } from "./mockAdapter";
import { ViewTracker } from "./viewTracker";

const ad = { adId: "a1", campaignId: "c1", copy: "Hi", url: "https://x.dev", iconUrl: null, isHouseAd: true };

function setup(opts: { killActive?: boolean; ad?: typeof ad | null } = {}) {
  let t = 0;
  const now = () => t;
  const adapter = new MockAdapter();
  const api = { serve: vi.fn().mockResolvedValue(opts.ad === undefined ? ad : opts.ad), sendEvent: vi.fn().mockResolvedValue(true) };
  const killswitch = { isActive: () => Boolean(opts.killActive) };
  const tracker = new ViewTracker(now);
  const orch = new Orchestrator({
    adapter, api: api as any, tracker, killswitch: killswitch as any, installId: "inst", now,
  });
  orch.start();
  return { adapter, api, orch, advance: (ms: number) => { t += ms; } };
}

describe("Orchestrator", () => {
  it("serves + renders on wait-start, then emits an impression with visibleMs on wait-end", async () => {
    const { adapter, api, advance } = setup();
    await adapter.fireWaitStart();
    expect(api.serve).toHaveBeenCalledWith("claude-code-terminal");
    expect(adapter.lastRendered?.campaignId).toBe("c1");
    advance(6000);
    await adapter.fireWaitEnd();
    expect(adapter.lastRendered).toBeNull(); // cleared
    expect(api.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "c1", type: "impression", visibleMs: 6000, installId: "inst" }),
    );
  });

  it("does nothing when the killswitch is active", async () => {
    const { adapter, api } = setup({ killActive: true });
    await adapter.fireWaitStart();
    expect(api.serve).not.toHaveBeenCalled();
    expect(adapter.lastRendered).toBeNull();
  });

  it("renders nothing when there is no ad inventory", async () => {
    const { adapter, api } = setup({ ad: null });
    await adapter.fireWaitStart();
    expect(api.serve).toHaveBeenCalled();
    expect(adapter.lastRendered).toBeNull();
  });

  it("pauses view time when unfocused", async () => {
    const { adapter, api, orch, advance } = setup();
    await adapter.fireWaitStart();
    advance(2000);
    orch.onFocusChange(false);
    advance(10000);        // unfocused — not counted
    orch.onFocusChange(true);
    advance(1000);
    await adapter.fireWaitEnd();
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ visibleMs: 3000 }));
  });
});
```

> Note: `fireWaitStart/fireWaitEnd` call async handlers; the test `await`s them. Make the orchestrator's handlers async and have `MockAdapter.fireWaitStart/End` return the handler's result so tests can await. (Update `mockAdapter.ts` `fireWaitStart`/`fireWaitEnd` to `return this.handlers?.onWaitStart();`.)

- [ ] **Step 2: Update `MockAdapter.fireWaitStart/fireWaitEnd` to return the handler result** (so async handlers are awaitable)

```ts
  fireWaitStart(): unknown { return this.handlers?.onWaitStart(); }
  fireWaitEnd(): unknown { return this.handlers?.onWaitEnd(); }
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter @vibearning/extension test -- orchestrator`
Expected: FAIL — cannot find `./orchestrator`.

- [ ] **Step 4: Implement `src/core/orchestrator.ts`**

```ts
import type { EventIngest, ServeResponse, Surface } from "@vibearning/shared";
import type { SpinnerAdapter } from "./adapter";
import { ViewTracker } from "./viewTracker";
import { makeNonce } from "./nonce";

interface ApiLike {
  serve(surface: Surface): Promise<ServeResponse | null>;
  sendEvent(event: EventIngest): Promise<boolean>;
}
interface KillswitchLike {
  isActive(): boolean;
}

export interface OrchestratorDeps {
  adapter: SpinnerAdapter;
  api: ApiLike;
  tracker: ViewTracker;
  killswitch: KillswitchLike;
  installId: string;
  now: () => number;
  onEarn?: (ad: ServeResponse) => void;
}

export class Orchestrator {
  private dispose: (() => void) | null = null;
  private current: { ad: ServeResponse; nonce: string } | null = null;

  constructor(private readonly d: OrchestratorDeps) {}

  start(): void {
    this.dispose = this.d.adapter.start({
      onWaitStart: () => this.handleWaitStart(),
      onWaitEnd: () => this.handleWaitEnd(),
    });
  }

  stop(): void {
    this.dispose?.();
    this.dispose = null;
  }

  onFocusChange(focused: boolean): void {
    if (focused) this.d.tracker.resume();
    else this.d.tracker.pause();
  }

  private async handleWaitStart(): Promise<void> {
    if (this.d.killswitch.isActive()) return;
    const ad = await this.d.api.serve(this.d.adapter.surface);
    if (!ad) return;
    const nonce = makeNonce(this.d.installId, ad.campaignId, this.d.now());
    this.current = { ad, nonce };
    this.d.adapter.render(ad);
    this.d.tracker.start();
  }

  private async handleWaitEnd(): Promise<void> {
    if (!this.current) return;
    const visibleMs = this.d.tracker.stop();
    this.d.adapter.clear();
    const event: EventIngest = {
      installId: this.d.installId,
      campaignId: this.current.ad.campaignId,
      surface: this.d.adapter.surface,
      type: "impression",
      nonce: this.current.nonce,
      visibleMs,
    };
    const delivered = await this.d.api.sendEvent(event);
    if (delivered) this.d.onEarn?.(this.current.ad);
    this.current = null;
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @vibearning/extension test -- orchestrator`
Expected: PASS (4).

- [ ] **Step 6: Run the full extension suite**

Run: `pnpm --filter @vibearning/extension test`
Expected: all green (nonce, viewTracker, apiClient, killswitch, mockAdapter, registry, orchestrator).

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/core/orchestrator.ts apps/extension/src/core/orchestrator.test.ts apps/extension/src/core/mockAdapter.ts
git commit -m "feat(extension): orchestrator wiring wait-state→serve→render→track→event"
```

---

## Task 8: `vscode` host layer + manual test plan (compile-only)

**Files:** Create `src/host/extension.ts`, `src/host/secretStore.ts`, `src/MANUAL-TEST.md`

> No unit tests — these import `vscode`, which is only available in the Extension Host. Verification is the `tsc` compile + the manual test plan. Keep this layer thin: it only wires the tested core to VS Code.

- [ ] **Step 1: Implement `src/host/secretStore.ts`**

```ts
import * as vscode from "vscode";

const TOKEN_KEY = "vibearning.authToken";

export class SecretStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}
  async getToken(): Promise<string | undefined> { return this.secrets.get(TOKEN_KEY); }
  async setToken(token: string): Promise<void> { await this.secrets.store(TOKEN_KEY, token); }
  async clear(): Promise<void> { await this.secrets.delete(TOKEN_KEY); }
}
```

- [ ] **Step 2: Implement `src/host/extension.ts`**

```ts
import * as vscode from "vscode";
import { ApiClient } from "../core/apiClient";
import { Killswitch } from "../core/killswitch";
import { ViewTracker } from "../core/viewTracker";
import { Orchestrator } from "../core/orchestrator";
import { MockAdapter } from "../core/mockAdapter";
import { firstAvailable } from "../adapters/registry";

const API_BASE = process.env.VIBEARNING_API ?? "http://localhost:3000";
const INSTALL_KEY = "vibearning.installId";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Stable per-install id.
  let installId = context.globalState.get<string>(INSTALL_KEY);
  if (!installId) {
    installId = `inst_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await context.globalState.update(INSTALL_KEY, installId);
  }

  let cachedToken: string | undefined;
  context.secrets.get("vibearning.authToken").then((t) => { cachedToken = t; });

  const api = new ApiClient(API_BASE, fetch, () => cachedToken);
  const killswitch = new Killswitch(`${API_BASE}/config`, fetch);
  const tracker = new ViewTracker(() => Date.now());

  // Dev: MockAdapter is the fallback so the pipeline is exercisable without a live agent.
  const mock = new MockAdapter();
  const adapter = firstAvailable(mock);

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.text = "$(rocket) vibearning ₹0.00";
  status.show();

  const orch = new Orchestrator({
    adapter, api, tracker, killswitch, installId,
    now: () => Date.now(),
    onEarn: () => { status.text = "$(rocket) vibearning (ad shown)"; },
  });
  orch.start();

  // Poll killswitch + flush queued events periodically.
  const timer = setInterval(() => { void killswitch.poll(); void api.flushQueue(); }, 60_000);

  // Pause/resume view time with window focus.
  const focusSub = vscode.window.onDidChangeWindowState((s) => orch.onFocusChange(s.focused));

  // Dev commands to drive the MockAdapter for manual end-to-end testing.
  const simulate = vscode.commands.registerCommand("vibearning.simulateWait", () => mock.fireWaitStart());
  const endWait = vscode.commands.registerCommand("vibearning.endWait", () => mock.fireWaitEnd());

  context.subscriptions.push(status, focusSub, simulate, endWait, { dispose: () => { clearInterval(timer); orch.stop(); } });
}

export function deactivate(): void {}
```

- [ ] **Step 3: Create `src/MANUAL-TEST.md`**

```md
# Manual test — vibearning extension

The pure core is unit-tested. This verifies the VS Code wiring end-to-end against the running api.

## Prerequisites
- `docker compose up -d` (Postgres + Redis) and api running: `pnpm --filter @vibearning/api dev`
- Seed a house ad: `curl -X POST localhost:3000/admin/house-ads -H "x-admin-key: dev-admin-key-change-me" -H "content-type: application/json" -d '{"copy":"Hello from vibearning","url":"https://kbi.example","surface":"claude-code-terminal"}'`

## Run the extension
1. `pnpm --filter @vibearning/extension build`
2. Open `apps/extension` in VS Code, press **F5** (Extension Development Host).
3. Command Palette → **vibearning: Simulate Wait-State (dev)** → then **vibearning: End Wait-State (dev)**.
4. Confirm an `AdEvent` row was recorded:
   `docker compose exec -T postgres psql -U kbi -d kbi -c 'select "campaignId","surface","visibleMs","valid" from "AdEvent" order by "createdAt" desc limit 1;'`
   Expected: a row with `valid = t` and a `visibleMs` ≈ the time between the two commands.

## Real adapters (NOT yet implemented)
`claudeCode.ts` / `codex.ts` / `geminiCli.ts` are stubs (`isAvailable() === false`). Implementing real wait-state detection + line rendering for each agent is a separate research task — verify each against its live agent before enabling.
```

- [ ] **Step 4: Compile + bundle check**

Run: `pnpm --filter @vibearning/extension lint && pnpm --filter @vibearning/extension build`
Expected: `tsc --noEmit` passes; `dist/extension.js` produced.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/host apps/extension/src/MANUAL-TEST.md
git commit -m "feat(extension): vscode host wiring + manual test plan"
```

---

## Done criteria for Plan 03

- [ ] `pnpm --filter @vibearning/extension test` — all core suites green (nonce, viewTracker, apiClient, killswitch, mockAdapter, registry, orchestrator).
- [ ] `pnpm --filter @vibearning/extension lint && build` — compiles + bundles `dist/extension.js`.
- [ ] Manual test (`MANUAL-TEST.md`) records an `AdEvent` via the MockAdapter through the real api.
- [ ] Real adapters remain safe no-op stubs (`isAvailable() === false`), clearly flagged for follow-up.

**Next plan:** `04 — Auth` (Google OAuth for devs → token to `SecretStore`; advertiser auth for the portal). Then the extension's `getToken()` returns a real token and `/events` can attribute earnings to an account.
