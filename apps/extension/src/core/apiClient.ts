import type { EventIngest, ServeResponse, Surface } from "@kbi/shared";

/** The developer earnings summary returned by `GET /ledger/me/stats`. */
export interface DevStats {
  todayPaise: number;
  monthPaise: number;
  lifetimePaise: number;
  validImpressions: number;
  currency: string;
}

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

  /** Fetch up to `count` ads to rotate through during one wait-state. */
  async serveMany(surface: Surface, count: number): Promise<ServeResponse[]> {
    const res = await this.fetchFn(`${this.baseUrl}/serve?surface=${surface}&count=${count}`, { headers: this.headers() });
    if (!res.ok) return [];
    const body = (await res.json()) as { ad: ServeResponse | null; ads?: ServeResponse[] };
    if (body.ads) return body.ads;
    return body.ad ? [body.ad] : []; // back-compat with the old single-ad envelope
  }

  /** The signed-in dev's earnings, or null when unauthenticated / offline (never throws). */
  async fetchStats(): Promise<DevStats | null> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/ledger/me/stats`, { headers: this.headers() });
      if (!res.ok) return null;
      return (await res.json()) as DevStats;
    } catch {
      return null;
    }
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

  async loginWithGoogle(idToken: string): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/auth/google`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
    const body = (await res.json()) as { token: string };
    return body.token;
  }
}
