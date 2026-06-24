import type { CreateCampaign, EditCampaign, PayoutDestinationInput } from "@kbi/shared";

export interface AuthResult { token: string; account: { id: string; email: string | null; type: string } }
export interface Campaign { id: string; copy: string; url: string; surface?: string; status?: string; createdAt?: string }
export interface DailySpend { date: string; spendPaise: number }
export interface LedgerSummary { balancePaise: number; currency: string; validImpressions: number }
export interface Payout { id: string; provider: string; amountPaise: number; status: string; createdAt?: string }
export interface PayoutDestination { id: string; method: string; vpa: string | null; accountNumber: string | null; status: string }
export interface AuditEntry { id: string; actor: string; action: string; target: string | null; detail: string | null; createdAt: string }

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

  // Admin requests authenticate with a logged-in admin's JWT (Bearer), issued by /admin/login.
  private async adminReq<T>(adminToken: string, path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
    });
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  register(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  login(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  // Developer (supply-side) email/password onboarding — no extension required.
  devRegister(email: string, password: string): Promise<AuthResult> {
    return this.req("/dev/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  devLogin(email: string, password: string): Promise<AuthResult> {
    return this.req("/dev/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  adminLogin(email: string, password: string): Promise<AuthResult> {
    return this.req("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  // --- Account recovery ---
  requestPasswordReset(email: string, type: "dev" | "advertiser" | "admin"): Promise<{ ok: boolean }> {
    return this.req("/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email, type }) });
  }
  resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
    return this.req("/auth/password-reset", { method: "POST", body: JSON.stringify({ token, password }) });
  }
  requestEmailVerification(): Promise<{ ok: boolean }> {
    return this.req("/auth/verify-email/request", { method: "POST" });
  }
  verifyEmail(token: string): Promise<{ ok: boolean }> {
    return this.req("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  }

  // --- Data subject requests (DSAR) ---
  exportMyData(): Promise<unknown> {
    return this.req("/me/export", { method: "GET" });
  }
  deleteMyAccount(): Promise<{ ok: boolean }> {
    return this.req("/me", { method: "DELETE" });
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
  editCampaign(campaignId: string, dto: EditCampaign): Promise<Campaign> {
    return this.req(`/advertiser/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify(dto) });
  }
  pauseCampaign(campaignId: string): Promise<{ ok: boolean }> {
    return this.req(`/advertiser/campaigns/${campaignId}/pause`, { method: "POST" });
  }
  resumeCampaign(campaignId: string): Promise<{ ok: boolean }> {
    return this.req(`/advertiser/campaigns/${campaignId}/resume`, { method: "POST" });
  }
  campaignDailySpend(campaignId: string): Promise<DailySpend[]> {
    return this.req(`/advertiser/campaigns/${campaignId}/spend-daily`, { method: "GET" });
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

  // --- Admin / operations ---
  adminPendingCampaigns(adminKey: string): Promise<Campaign[]> {
    return this.adminReq(adminKey, "/admin/campaigns/pending", { method: "GET" });
  }
  adminApproveCampaign(adminKey: string, id: string): Promise<{ ok: boolean }> {
    return this.adminReq(adminKey, `/admin/campaigns/${id}/approve`, { method: "POST" });
  }
  adminPendingDestinations(adminKey: string): Promise<PayoutDestination[]> {
    return this.adminReq(adminKey, "/admin/payout-destinations/pending", { method: "GET" });
  }
  adminVerifyDestination(adminKey: string, id: string): Promise<{ ok: boolean }> {
    return this.adminReq(adminKey, `/admin/payout-destinations/${id}/verify`, { method: "POST", body: JSON.stringify({}) });
  }
  adminSetKillswitch(adminKey: string, active: boolean): Promise<{ ok: boolean }> {
    return this.adminReq(adminKey, "/admin/killswitch", { method: "POST", body: JSON.stringify({ active }) });
  }
  adminAudit(adminKey: string): Promise<AuditEntry[]> {
    return this.adminReq(adminKey, "/admin/audit", { method: "GET" });
  }
}
