import { describe, it, expect, vi } from "vitest";
import { PortalApi } from "./api";

function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

describe("PortalApi", () => {
  it("register posts credentials and returns token+account", async () => {
    const f = vi.fn().mockResolvedValue(json({ token: "t", account: { id: "a", email: "e", type: "advertiser" } }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch);
    expect(await api.register("e@x.com", "password1")).toMatchObject({ token: "t" });
    expect(f).toHaveBeenCalledWith("http://api/advertiser/register", expect.objectContaining({ method: "POST" }));
  });

  it("createCampaign sends the bearer token", async () => {
    const f = vi.fn().mockResolvedValue(json({ id: "c1" }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "tok");
    await api.createCampaign({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 });
    expect(f).toHaveBeenCalledWith("http://api/advertiser/campaigns", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer tok" }),
    }));
  });

  it("listCampaigns GETs with auth", async () => {
    const f = vi.fn().mockResolvedValue(json([{ id: "c1" }]));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "tok");
    expect(await api.listCampaigns()).toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: "bad" }, false));
    const api = new PortalApi("http://api", f as unknown as typeof fetch);
    await expect(api.login("e@x.com", "x")).rejects.toBeTruthy();
  });

  it("ledgerSummary GETs the dev balance with auth", async () => {
    const f = vi.fn().mockResolvedValue(json({ balancePaise: 1234, currency: "INR", validImpressions: 7 }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "devtok");
    expect(await api.ledgerSummary()).toMatchObject({ balancePaise: 1234, validImpressions: 7 });
    expect(f).toHaveBeenCalledWith("http://api/ledger/me/summary", expect.objectContaining({
      method: "GET", headers: expect.objectContaining({ authorization: "Bearer devtok" }),
    }));
  });

  it("setPayoutDestination POSTs the UPI destination", async () => {
    const f = vi.fn().mockResolvedValue(json({ id: "d1", method: "upi", vpa: "dev@okaxis", status: "pending" }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "devtok");
    await api.setPayoutDestination({ method: "upi", vpa: "dev@okaxis" });
    expect(f).toHaveBeenCalledWith("http://api/payouts/destination", expect.objectContaining({ method: "POST" }));
  });

  it("requestPayout POSTs to /payouts", async () => {
    const f = vi.fn().mockResolvedValue(json({ id: "p1", provider: "razorpay", amountPaise: 15000, status: "paid" }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "devtok");
    expect(await api.requestPayout()).toMatchObject({ status: "paid" });
    expect(f).toHaveBeenCalledWith("http://api/payouts", expect.objectContaining({ method: "POST" }));
  });

  it("admin requests send the x-admin-key header (not a bearer token)", async () => {
    const f = vi.fn().mockResolvedValue(json([{ id: "c1", copy: "x", url: "u" }]));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "ignored-bearer");
    await api.adminPendingCampaigns("secret-key");
    expect(f).toHaveBeenCalledWith("http://api/admin/campaigns/pending", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ "x-admin-key": "secret-key" }),
    }));
    const sentHeaders = f.mock.calls[0][1].headers as Record<string, string>;
    expect(sentHeaders.authorization).toBeUndefined();
  });

  it("adminApproveCampaign POSTs to the approve endpoint", async () => {
    const f = vi.fn().mockResolvedValue(json({ ok: true }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch);
    await api.adminApproveCampaign("k", "c1");
    expect(f).toHaveBeenCalledWith("http://api/admin/campaigns/c1/approve", expect.objectContaining({ method: "POST" }));
  });
});
