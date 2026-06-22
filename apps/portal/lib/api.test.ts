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
});
