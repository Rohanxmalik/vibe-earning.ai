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
