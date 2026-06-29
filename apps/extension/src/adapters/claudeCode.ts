import type { ServeResponse } from "@kbi/shared";
import type { SpinnerAdapter, WaitHandlers } from "../core/adapter";
import { composeStatusLine } from "../statusline/compose";

/**
 * Where the sponsored line is written, and how the original spinner content is restored.
 * Production wires this to Claude Code's official status-line surface (a writer that the
 * agent renders at the bottom of the session — see docs/extension/claude-code-statusline.md).
 * Every method is best-effort: a throwing host must NEVER break the editor, so the adapter
 * swallows sink errors and falls back to the stock spinner.
 */
export interface StatusSink {
  /**
   * Render a single status line (the composed sponsored text). `url` is the ad's click target;
   * `color` is the brand tint (a hex string), or undefined for the theme default.
   */
  write(line: string, url?: string, color?: string): void;
  /** Restore the agent's own status line (stop showing our text). */
  restore(): void;
}

/**
 * Emits the agent's wait-state lifecycle: it fires `onWaitStart` when Claude Code begins a
 * "thinking…" wait, `onTick` as the spinner refreshes (drives rotation), and `onWaitEnd` when
 * the wait resolves. Production binds this to Claude Code's spinner/status refresh; tests drive
 * it directly. Returns a dispose that detaches all listeners.
 */
export type WaitSource = (handlers: WaitHandlers) => () => void;

export interface ClaudeCodeDeps {
  /** Detect whether Claude Code is actually present. Default: probe the environment. */
  detect?: () => boolean;
  /** The wait-state signal source. Default: a no-op (no live agent in this environment yet). */
  waitSource?: WaitSource;
  /** The status-line surface. Default: a no-op sink (nothing rendered). */
  sink?: StatusSink;
  /** Hard cap on the rendered line length (terminal status lines are narrow). */
  maxLen?: number;
}

/**
 * Detect Claude Code from the process environment. Claude Code sets `CLAUDECODE=1` (and a
 * `CLAUDE_CODE_ENTRYPOINT`) for the processes it spawns, so an extension/hook running under it
 * can self-identify without scraping any UI. Injectable for tests.
 */
export function detectClaudeCode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAUDECODE === "1" || Boolean(env.CLAUDE_CODE_ENTRYPOINT);
}

/**
 * Claude Code adapter. Drives the in-editor Orchestrator loop against Claude Code's wait-states,
 * rendering the sponsored line into the agent's official status-line surface and restoring the
 * stock spinner on clear. All host interaction is fail-safe: any error renders nothing and never
 * disrupts the agent (per docs/extension/claude-code-statusline.md — prefer the official status
 * line, never patch Anthropic's UI).
 */
export class ClaudeCodeAdapter implements SpinnerAdapter {
  readonly surface = "claude-code-panel";

  private readonly detect: () => boolean;
  private readonly waitSource: WaitSource;
  private readonly sink: StatusSink;
  private readonly maxLen?: number;

  constructor(deps: ClaudeCodeDeps = {}) {
    this.detect = deps.detect ?? (() => detectClaudeCode());
    this.waitSource = deps.waitSource ?? (() => () => {});
    this.sink = deps.sink ?? { write: () => {}, restore: () => {} };
    this.maxLen = deps.maxLen;
  }

  isAvailable(): boolean {
    try {
      return this.detect();
    } catch {
      return false; // never let detection throw take down adapter selection
    }
  }

  start(handlers: WaitHandlers): () => void {
    try {
      return this.waitSource(handlers);
    } catch {
      return () => {}; // a broken source must not break the editor
    }
  }

  render(ad: ServeResponse): void {
    try {
      const line = composeStatusLine(ad, this.maxLen !== undefined ? { maxLen: this.maxLen } : {});
      if (line) this.sink.write(line, ad.url, ad.brandColor ?? undefined);
    } catch {
      // swallow — never break the host status line over a render failure
    }
  }

  clear(): void {
    try {
      this.sink.restore();
    } catch {
      // swallow — restoring is best-effort
    }
  }
}
