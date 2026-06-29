import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "./apiClient";

const ad = { adId: "a1", campaignId: "c1", copy: "Hi", url: "https://x.dev", iconUrl: null, isHouseAd: true };
const ev = { installId: "i", campaignId: "c1", surface: "codex-panel" as const, type: "impression" as const, nonce: "nonce123", visibleMs: 6000 };

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe("ApiClient", () => {
  it("serve() returns the ad from the response envelope", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ad }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.serve("codex-panel")).toEqual(ad);
    expect(fetchFn).toHaveBeenCalledWith("http://api/serve?surface=codex-panel", expect.anything());
  });

  it("serve() returns null when no inventory", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ad: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.serve("codex-panel")).toBeNull();
  });

  it("serveMany() requests count and returns the ads rotation list", async () => {
    const ad2 = { ...ad, adId: "a2", campaignId: "c2" };
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ad, ads: [ad, ad2] }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.serveMany("codex-panel", 3)).toEqual([ad, ad2]);
    expect(fetchFn).toHaveBeenCalledWith("http://api/serve?surface=codex-panel&count=3", expect.anything());
  });

  it("serveMany() falls back to [ad] for an old single-ad response, and [] when empty", async () => {
    const c1 = new ApiClient("http://api", vi.fn().mockResolvedValue(jsonResponse({ ad })) as unknown as typeof fetch);
    expect(await c1.serveMany("codex-panel", 3)).toEqual([ad]);
    const c2 = new ApiClient("http://api", vi.fn().mockResolvedValue(jsonResponse({ ad: null })) as unknown as typeof fetch);
    expect(await c2.serveMany("codex-panel", 3)).toEqual([]);
  });

  it("sendEvent() posts and returns true on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ deduped: false, valid: true, reason: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.sendEvent(ev)).toBe(true);
    expect(c.queueLength).toBe(0);
  });

  it("sendEvent() queues on network failure and flush retries", async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error("offline"))
                           .mockResolvedValue(jsonResponse({ deduped: false, valid: true, reason: null }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.sendEvent(ev)).toBe(false);
    expect(c.queueLength).toBe(1);
    await c.flushQueue();
    expect(c.queueLength).toBe(0);
  });

  it("fetchStats returns the dev earnings, or null on error", async () => {
    const stats = { todayPaise: 50, monthPaise: 75, lifetimePaise: 75, validImpressions: 5, currency: "INR" };
    const ok = new ApiClient("http://api", vi.fn().mockResolvedValue(jsonResponse(stats)) as unknown as typeof fetch);
    expect(await ok.fetchStats()).toEqual(stats);
    const bad = new ApiClient("http://api", vi.fn().mockResolvedValue(jsonResponse({}, false)) as unknown as typeof fetch);
    expect(await bad.fetchStats()).toBeNull();
    const offline = new ApiClient("http://api", vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch);
    expect(await offline.fetchStats()).toBeNull();
  });

  it("loginWithGoogle posts the idToken and returns the KBI token", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ token: "kbi.jwt", account: { id: "a", email: null, type: "dev" } }));
    const c = new ApiClient("http://api", fetchFn as unknown as typeof fetch);
    expect(await c.loginWithGoogle("idtok")).toBe("kbi.jwt");
    expect(fetchFn).toHaveBeenCalledWith("http://api/auth/google", expect.objectContaining({ method: "POST" }));
  });
});
