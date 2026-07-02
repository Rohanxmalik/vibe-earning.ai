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
