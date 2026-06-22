import type { EventIngest, ServeResponse, Surface } from "@kbi/shared";

export class ApiClient {
  private queue: EventIngest[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch,
    private readonly getToken: () => string | undefined = () => undefined,
  ) {}

  get queueLength(): number {
    return this.queue.length;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const token = this.getToken();
    if (token) h["authorization"] = `Bearer ${token}`;
    return h;
  }

  async serve(surface: Surface): Promise<ServeResponse | null> {
    const res = await this.fetchFn(`${this.baseUrl}/serve?surface=${surface}`, { headers: this.headers() });
    if (!res.ok) return null;
    const body = (await res.json()) as { ad: ServeResponse | null };
    return body.ad;
  }

  /** Returns true if delivered now; false if queued for later retry. Never throws on network error. */
  async sendEvent(event: EventIngest): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/events`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(event),
      });
      if (!res.ok) {
        this.queue.push(event);
        return false;
      }
      return true;
    } catch {
      this.queue.push(event);
      return false;
    }
  }

  async flushQueue(): Promise<void> {
    const pending = this.queue;
    this.queue = [];
    for (const event of pending) {
      const ok = await this.sendEvent(event);
      if (!ok) {
        // sendEvent re-queued it on failure; stop to preserve order and retry later.
        break;
      }
    }
  }
}
