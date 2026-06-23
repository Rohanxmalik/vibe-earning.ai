import type { CreateCampaign, PayoutDestinationInput } from "@kbi/shared";

export interface AuthResult { token: string; account: { id: string; email: string | null; type: string } }
export interface Campaign { id: string; copy: string; url: string; surface?: string; createdAt?: string }
export interface LedgerSummary { balancePaise: number; currency: string; validImpressions: number }
export interface Payout { id: string; provider: string; amountPaise: number; status: string; createdAt?: string }
export interface PayoutDestination { id: string; method: string; vpa: string | null; accountNumber: string | null; status: string }

export class PortalApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly getToken: () => string | undefined = () => undefined,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const t = this.getToken();
    if (t) h["authorization"] = `Bearer ${t}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  register(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  login(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  createCampaign(dto: CreateCampaign): Promise<{ id: string }> {
    return this.req("/advertiser/campaigns", { method: "POST", body: JSON.stringify(dto) });
  }
  listCampaigns(): Promise<Campaign[]> {
    return this.req("/advertiser/campaigns", { method: "GET" });
  }
  buyBlocks(campaignId: string, quantity: number): Promise<{ id: string; status: string; amountPaise: number }> {
    return this.req(`/advertiser/campaigns/${campaignId}/blocks`, { method: "POST", body: JSON.stringify({ quantity }) });
  }

  // --- Developer (supply) side ---
  ledgerSummary(): Promise<LedgerSummary> {
    return this.req("/ledger/me/summary", { method: "GET" });
  }
  myPayouts(): Promise<Payout[]> {
    return this.req("/payouts/me", { method: "GET" });
  }
  requestPayout(): Promise<Payout> {
    return this.req("/payouts", { method: "POST" });
  }
  myPayoutDestinations(): Promise<PayoutDestination[]> {
    return this.req("/payouts/destination", { method: "GET" });
  }
  setPayoutDestination(dto: PayoutDestinationInput): Promise<PayoutDestination> {
    return this.req("/payouts/destination", { method: "POST", body: JSON.stringify(dto) });
  }
}
