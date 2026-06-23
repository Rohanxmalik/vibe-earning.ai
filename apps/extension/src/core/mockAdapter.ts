import type { ServeResponse } from "@kbi/shared";
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

  fireWaitStart(): unknown { return this.handlers?.onWaitStart(); }
  fireWaitEnd(): unknown { return this.handlers?.onWaitEnd(); }
  fireTick(): unknown { return this.handlers?.onTick?.(); }
}
