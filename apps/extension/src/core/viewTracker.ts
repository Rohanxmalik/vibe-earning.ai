/** Accumulates on-screen time, counting only intervals where the ad is visible AND focused.
 *  `now` is injected for testability. */
export class ViewTracker {
  private accumulatedMs = 0;
  private activeSince: number | null = null;

  constructor(private readonly now: () => number) {}

  start(): void {
    this.accumulatedMs = 0;
    this.activeSince = this.now();
  }

  pause(): void {
    if (this.activeSince !== null) {
      this.accumulatedMs += this.now() - this.activeSince;
      this.activeSince = null;
    }
  }

  resume(): void {
    if (this.activeSince === null) this.activeSince = this.now();
  }

  stop(): number {
    this.pause();
    return this.accumulatedMs;
  }

  get visibleMs(): number {
    return this.accumulatedMs + (this.activeSince !== null ? this.now() - this.activeSince : 0);
  }
}
