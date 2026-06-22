/** Polls a server flag; when active, the orchestrator serves no ads.
 *  On poll error keeps the last known state (a transient blip should not flip ads off/on). */
export class Killswitch {
  private active = false;

  constructor(private readonly url: string, private readonly fetchFn: typeof fetch) {}

  isActive(): boolean {
    return this.active;
  }

  async poll(): Promise<boolean> {
    try {
      const res = await this.fetchFn(this.url);
      if (res.ok) {
        const body = (await res.json()) as { active?: boolean };
        this.active = Boolean(body.active);
      }
    } catch {
      // keep last known state
    }
    return this.active;
  }
}
