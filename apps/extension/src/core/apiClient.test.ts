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
});
