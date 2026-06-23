import type { ServeResponse, Surface } from "@kbi/shared";

export interface WaitHandlers {
  onWaitStart(): void;
  onWaitEnd(): void;
  /** Fires as the spinner updates (e.g. its status word changes) — drives ad rotation. Optional. */
  onTick?(): void;
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
