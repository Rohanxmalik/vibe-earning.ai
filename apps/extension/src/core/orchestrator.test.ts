import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import { MockAdapter } from "./mockAdapter";
import { ViewTracker } from "./viewTracker";

const ad = { adId: "a1", campaignId: "c1", copy: "Hi", url: "https://x.dev", iconUrl: null, isHouseAd: true };
const ad2 = { ...ad, adId: "a2", campaignId: "c2", copy: "Yo" };
const ad3 = { ...ad, adId: "a3", campaignId: "c3", copy: "Zo" };

function setup(opts: { killActive?: boolean; ads?: (typeof ad)[]; holdScheduleMs?: number[] } = {}) {
  let t = 0;
  const now = () => t;
  const adapter = new MockAdapter();
  const api = {
    serveMany: vi.fn().mockResolvedValue(opts.ads ?? [ad]),
    sendEvent: vi.fn().mockResolvedValue(true),
  };
  const killswitch = { isActive: () => Boolean(opts.killActive) };
  const tracker = new ViewTracker(now);
  const orch = new Orchestrator({
    adapter, api: api as any, tracker, killswitch: killswitch as any, installId: "inst", now,
    holdMs: 5000, rotationCount: 3, holdScheduleMs: opts.holdScheduleMs,
  });
  orch.start();
  return { adapter, api, orch, advance: (ms: number) => { t += ms; } };
}

describe("Orchestrator", () => {
  it("serves + renders on wait-start, then emits an impression with visibleMs on wait-end", async () => {
    const { adapter, api, advance } = setup();
    await adapter.fireWaitStart();
    expect(api.serveMany).toHaveBeenCalledWith("claude-code-terminal", 3);
    expect(adapter.lastRendered?.campaignId).toBe("c1");
    advance(6000);
    await adapter.fireWaitEnd();
    expect(adapter.lastRendered).toBeNull(); // cleared
    expect(api.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "c1", type: "impression", visibleMs: 6000, installId: "inst" }),
    );
  });

  it("does nothing when the killswitch is active", async () => {
    const { adapter, api } = setup({ killActive: true });
    await adapter.fireWaitStart();
    expect(api.serveMany).not.toHaveBeenCalled();
    expect(adapter.lastRendered).toBeNull();
  });

  it("renders nothing when there is no ad inventory", async () => {
    const { adapter, api } = setup({ ads: [] });
    await adapter.fireWaitStart();
    expect(api.serveMany).toHaveBeenCalled();
    expect(adapter.lastRendered).toBeNull();
  });

  it("pauses view time when unfocused", async () => {
    const { adapter, api, orch, advance } = setup();
    await adapter.fireWaitStart();
    advance(2000);
    orch.onFocusChange(false);
    advance(10000);        // unfocused — not counted
    orch.onFocusChange(true);
    advance(1000);
    await adapter.fireWaitEnd();
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ visibleMs: 3000 }));
  });

  it("rotates to the next ad after holdMs of visibility, billing each ad separately", async () => {
    const { adapter, api, advance } = setup({ ads: [ad, ad2] });
    await adapter.fireWaitStart();
    expect(adapter.lastRendered?.campaignId).toBe("c1");

    advance(5000);               // ad #1 visible long enough
    await adapter.fireTick();
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c1", visibleMs: 5000 }));
    expect(adapter.lastRendered?.campaignId).toBe("c2"); // rotated

    advance(3000);
    await adapter.fireWaitEnd();
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c2", visibleMs: 3000 }));
    expect(adapter.lastRendered).toBeNull();
  });

  it("does not rotate before holdMs has elapsed", async () => {
    const { adapter, api, advance } = setup({ ads: [ad, ad2] });
    await adapter.fireWaitStart();
    advance(2000);
    await adapter.fireTick();
    expect(adapter.lastRendered?.campaignId).toBe("c1"); // still the first ad
    expect(api.sendEvent).not.toHaveBeenCalled();
  });

  it("loops a single ad: re-bills and re-shows it on each hold while thinking", async () => {
    const { adapter, api, advance } = setup({ ads: [ad] });
    await adapter.fireWaitStart();
    advance(5000);
    await adapter.fireTick();
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c1", visibleMs: 5000 }));
    expect(adapter.lastRendered?.campaignId).toBe("c1"); // re-shown (looped, new impression)
  });

  it("loops back to the first (highest-bid) ad after the last", async () => {
    const { adapter, advance } = setup({ ads: [ad, ad2] });
    await adapter.fireWaitStart();
    expect(adapter.lastRendered?.campaignId).toBe("c1");
    advance(5000); await adapter.fireTick();
    expect(adapter.lastRendered?.campaignId).toBe("c2");
    advance(5000); await adapter.fireTick();
    expect(adapter.lastRendered?.campaignId).toBe("c1"); // looped back to the top
  });

  it("honors a per-position hold schedule (10s, 5s, 3s) and then repeats", async () => {
    const { adapter, api, advance } = setup({ ads: [ad, ad2, ad3], holdScheduleMs: [10000, 5000, 3000] });
    await adapter.fireWaitStart();
    expect(adapter.lastRendered?.campaignId).toBe("c1");

    advance(9000); await adapter.fireTick();
    expect(adapter.lastRendered?.campaignId).toBe("c1"); // still c1 (< 10s)

    advance(1000); await adapter.fireTick();             // total 10s on c1
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c1", visibleMs: 10000 }));
    expect(adapter.lastRendered?.campaignId).toBe("c2");

    advance(5000); await adapter.fireTick();             // 5s on c2
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c2", visibleMs: 5000 }));
    expect(adapter.lastRendered?.campaignId).toBe("c3");

    advance(3000); await adapter.fireTick();             // 3s on c3
    expect(api.sendEvent).toHaveBeenCalledWith(expect.objectContaining({ campaignId: "c3", visibleMs: 3000 }));
    expect(adapter.lastRendered?.campaignId).toBe("c1"); // schedule + cycle repeat
  });
});
