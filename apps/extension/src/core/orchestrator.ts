import type { EventIngest, ServeResponse, Surface } from "@kbi/shared";
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
