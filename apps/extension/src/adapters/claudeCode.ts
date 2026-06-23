import type { ServeResponse } from "@kbi/shared";
import type { SpinnerAdapter, WaitHandlers } from "../core/adapter";

/** STUB — real impl pending (Claude Code terminal status-line / spinner-verb hook).
 *  See MANUAL-TEST.md. Currently reports unavailable so it is never auto-selected. */
export class ClaudeCodeAdapter implements SpinnerAdapter {
  readonly surface = "claude-code-terminal";
  isAvailable(): boolean { return false; } // TODO: detect Claude Code
  // TODO: hook wait-states. Call handlers.onWaitStart/onWaitEnd around the spinner, and
  // handlers.onTick() each time the status word changes — that drives top-N ad rotation.
  start(_handlers: WaitHandlers): () => void { return () => {}; }
  render(_ad: ServeResponse): void { /* TODO: write sponsored line */ }
  clear(): void { /* TODO: restore */ }
}
