import type { CreateCampaign, EditCampaign, PayoutDestinationInput } from "@vibearning/shared";

export interface AuthResult { token: string; account: { id: string; email: string | null; type: string } }
export interface Campaign { id: string; copy: string; headline?: string | null; tagline?: string | null; brandColor?: string | null; emoji?: string | null; iconUrl?: string | null; url: string; surface?: string; status?: string; createdAt?: string }
export interface DailySpend { date: string; spendPaise: number }
export interface LedgerSummary { balancePaise: number; currency: string; validImpressions: number }
export interface LedgerStats { todayPaise: number; monthPaise: number; lifetimePaise: number; validImpressions: number; currency: string }
export interface ActivityPoint { bucket: string; earnedPaise: number; impressions: number }
export interface LedgerEvent { id: string; type: string; campaign: string | null; amountPaise: number; valid: boolean; createdAt: string }
export interface LimitInfo { count: number; cap: number; resetAt: string }
export interface UsageInfo { hourly: LimitInfo; daily: LimitInfo }
export interface Eligibility { country: string | null; inIndia: boolean; canPayout: boolean; reason?: string; method: string; payoutMinPaise: number }
export type ActivityWindow = "24h" | "7d" | "30d";
export interface Payout { id: string; provider: string; amountPaise: number; status: string; createdAt?: string }
export interface PayoutDestination { id: string; method: string; vpa: string | null; accountNumber: string | null; status: string }
export interface AuditEntry { id: string; actor: string; action: string; target: string | null; detail: string | null; createdAt: string }

/**
 * Error from a portal API call. `status === 0` means the request never reached the
 * server (network error / API not running). `code` is the server's `message` field
 * when it's a string (e.g. "email_taken", "invalid_credentials").
 */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code?: string) {
    super(code ?? (status === 0 ? "network error" : `request failed: ${status}`));
    this.name = "ApiError";
  }
}

/** Best-effort extraction of the server's string error code (e.g. NestJS `message`). */
async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { message?: unknown };
    return typeof body?.message === "string" ? body.message : undefined;
  } catch {
    return undefined;
  }
}

export class PortalApi {
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    fetchFn: typeof fetch = fetch,
    private readonly getToken: () => string | undefined = () => undefined,
  ) {
    // Native `fetch` must be invoked with `this === window`. Stored on an instance
    // and called as `this.fetchFn(...)`, the receiver becomes the PortalApi object and
    // the browser throws "Illegal invocation". Bind the real fetch to the global so it
    // works regardless of how it's called. (Injected test mocks are left untouched.)
    this.fetchFn = fetchFn === fetch ? fetch.bind(globalThis) : fetchFn;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const t = this.getToken();
    if (t) h["authorization"] = `Bearer ${t}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    } catch {
      throw new ApiError(0); // never reached the server (network / API down)
    }
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    return (await res.json()) as T;
  }

  // Admin requests authenticate with a logged-in admin's JWT (Bearer), issued by /admin/login.
  private async adminReq<T>(adminToken: string, path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      });
    } catch {
      throw new ApiError(0);
    }
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
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
  /** Upload a logo (the file as a data URI) to object storage; returns the hosted URL. */
  async uploadLogo(dataUrl: string): Promise<string> {
    const { url } = await this.req<{ url: string }>("/uploads/logo", { method: "POST", body: JSON.stringify({ dataUrl }) });
    return url;
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
  me(): Promise<{ id: string; email: string | null; type: string }> {
    return this.req("/auth/me", { method: "GET" });
  }
  ledgerSummary(): Promise<LedgerSummary> {
    return this.req("/ledger/me/summary", { method: "GET" });
  }
  ledgerStats(): Promise<LedgerStats> {
    return this.req("/ledger/me/stats", { method: "GET" });
  }
  ledgerActivity(window: ActivityWindow): Promise<ActivityPoint[]> {
    return this.req(`/ledger/me/activity?window=${window}`, { method: "GET" });
  }
  ledgerEvents(limit = 500): Promise<LedgerEvent[]> {
    return this.req(`/ledger/me/events?limit=${limit}`, { method: "GET" });
  }
  usage(): Promise<UsageInfo> {
    return this.req("/metrics/me/usage", { method: "GET" });
  }
  eligibility(): Promise<Eligibility> {
    return this.req("/me/eligibility", { method: "GET" });
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
