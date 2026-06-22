import type { ServeResponse } from "@kbi/shared";
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
