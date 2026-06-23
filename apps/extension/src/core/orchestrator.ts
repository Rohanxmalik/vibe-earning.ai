import type { EventIngest, ServeResponse, Surface } from "@kbi/shared";
import type { SpinnerAdapter } from "./adapter";
import { ViewTracker } from "./viewTracker";
import { makeNonce } from "./nonce";

interface ApiLike {
  serveMany(surface: Surface, count: number): Promise<ServeResponse[]>;
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
  /** Max ads to rotate through in one wait-state (default 3). */
  rotationCount?: number;
  /** Min visible ms an ad must accrue before we rotate to the next (default 5000). */
  holdMs?: number;
  onEarn?: (ad: ServeResponse) => void;
}

export class Orchestrator {
  private dispose: (() => void) | null = null;
  private queue: ServeResponse[] = [];
  private current: { ad: ServeResponse; nonce: string } | null = null;

  constructor(private readonly d: OrchestratorDeps) {}

  start(): void {
    this.dispose = this.d.adapter.start({
      onWaitStart: () => this.handleWaitStart(),
      onWaitEnd: () => this.handleWaitEnd(),
      onTick: () => this.handleTick(),
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
    const count = this.d.rotationCount ?? 3;
    const ads = await this.d.api.serveMany(this.d.adapter.surface, count);
    if (ads.length === 0) return;
    this.queue = ads;
    this.showNext();
  }

  /** Rotate when the current ad has been seen long enough and more ads are queued. */
  private handleTick(): void {
    if (!this.current || this.queue.length === 0) return;
    const holdMs = this.d.holdMs ?? 5000;
    if (this.d.tracker.visibleMs >= holdMs) {
      void this.finalizeCurrent(); // bill the ad just shown
      this.showNext();             // and rotate to the next
    }
  }

  private async handleWaitEnd(): Promise<void> {
    if (!this.current) return;
    await this.finalizeCurrent();
    this.d.adapter.clear();
    this.queue = [];
  }

  private showNext(): void {
    const ad = this.queue.shift();
    if (!ad) return;
    const nonce = makeNonce(this.d.installId, ad.campaignId, this.d.now());
    this.current = { ad, nonce };
    this.d.adapter.render(ad);
    this.d.tracker.start();
  }

  /** Record an impression for the currently shown ad (captures visibleMs synchronously first). */
  private async finalizeCurrent(): Promise<void> {
    if (!this.current) return;
    const visibleMs = this.d.tracker.stop();
    const cur = this.current;
    this.current = null;
    const event: EventIngest = {
      installId: this.d.installId,
      campaignId: cur.ad.campaignId,
      surface: this.d.adapter.surface,
      type: "impression",
      nonce: cur.nonce,
      visibleMs,
    };
    const delivered = await this.d.api.sendEvent(event);
    if (delivered) this.d.onEarn?.(cur.ad);
  }
}
