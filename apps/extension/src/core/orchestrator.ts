import type { EventIngest, ServeResponse, Surface } from "@vibearning/shared";
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
  /**
   * Per-position visible-ms before rotating, e.g. `[45000, 30000, 15000]` holds the first
   * (highest-bid) ad 45s, the next 30s, the next 15s. The index wraps with the rotation cycle,
   * so the schedule repeats as the ads loop. Falls back to `holdMs` when absent.
   */
  holdScheduleMs?: number[];
  onEarn?: (ad: ServeResponse) => void;
  /**
   * Called whenever an ad becomes visible (first show AND each rotation) — drives a rich
   * surface like the sidebar webview. `ad` is the live (billed) ad; `context.lineup` is the full
   * served rotation set with `activeIndex` pointing at `ad`, so the surface can show the whole
   * line-up (winner live, the rest "up next") without changing what's billed. Best-effort: the
   * caller must never throw back into the loop.
   */
  onShow?: (ad: ServeResponse, context: { lineup: ServeResponse[]; activeIndex: number }) => void;
  /** Called when the wait ends and the ad slot goes idle (clear the rich surface). */
  onHide?: () => void;
  /**
   * Persist the last-shown rotation slot so the NEXT wait-state resumes at the following ad
   * (round-robin) instead of always restarting at the top — every advertiser gets exposure
   * even when turns are short. Default: in-memory (per session). Wire to durable storage
   * (e.g. VS Code globalState) to also survive reloads.
   */
  loadCursor?: () => number;
  saveCursor?: (idx: number) => void;
}

export class Orchestrator {
  private dispose: (() => void) | null = null;
  /** The served ads for the current wait, ranked highest-bid first; cycled (looped) while thinking. */
  private ads: ServeResponse[] = [];
  private idx = 0;
  private current: { ad: ServeResponse; nonce: string } | null = null;
  /** Slot last actually shown to the user; persisted so the next wait-state starts at lastShown+1. */
  private lastShown: number;

  constructor(private readonly d: OrchestratorDeps) {
    this.lastShown = d.loadCursor?.() ?? -1; // -1 => the very first turn starts at slot 0
  }

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
    this.ads = ads; // ranked highest-bid first by /serve
    // Round-robin across turns: resume at the ad AFTER the one last shown, so short turns still
    // cycle through every advertiser instead of always re-showing the top ad. (% clamps if the
    // served list got shorter since last time.)
    this.idx = (this.lastShown + 1) % this.ads.length;
    this.showCurrent();
  }

  /** Visible-ms the ad at `idx` must accrue before rotating (per-position schedule, else holdMs). */
  private holdFor(idx: number): number {
    const s = this.d.holdScheduleMs;
    if (s && s.length > 0) return s[idx % s.length];
    return this.d.holdMs ?? 5000;
  }

  /** Rotate when the current ad has been seen long enough; loop back to the top after the last. */
  private handleTick(): void {
    if (!this.current || this.ads.length === 0) return;
    if (this.d.tracker.visibleMs < this.holdFor(this.idx)) return;
    void this.finalizeCurrent();                  // bill the ad just shown
    this.idx = (this.idx + 1) % this.ads.length;  // advance, looping to the highest-bid ad
    this.showCurrent();                           // and show the next in the cycle
  }

  private async handleWaitEnd(): Promise<void> {
    if (!this.current) return;
    await this.finalizeCurrent();
    this.d.adapter.clear();
    this.notify(() => this.d.onHide?.());
    this.ads = [];
    this.idx = 0;
  }

  private showCurrent(): void {
    const ad = this.ads[this.idx];
    if (!ad) return;
    const nonce = makeNonce(this.d.installId, ad.campaignId, this.d.now());
    this.current = { ad, nonce };
    this.lastShown = this.idx;        // remember the slot we're showing now…
    this.d.saveCursor?.(this.idx);    // …and persist it so the next turn resumes after it
    this.d.adapter.render(ad);
    // mirror to rich surfaces (sidebar webview): the live ad + the full line-up for "up next".
    this.notify(() => this.d.onShow?.(ad, { lineup: this.ads, activeIndex: this.idx }));
    this.d.tracker.start();
  }

  /** Run an optional observer callback without ever letting it break the rotation loop. */
  private notify(fn: () => void): void {
    try {
      fn();
    } catch {
      /* a rich-surface observer must never disrupt billing/rotation */
    }
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
