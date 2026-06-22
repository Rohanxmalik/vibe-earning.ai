import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "./orchestrator";
import { MockAdapter } from "./mockAdapter";
import { ViewTracker } from "./viewTracker";

const ad = { adId: "a1", campaignId: "c1", copy: "Hi", url: "https://x.dev", iconUrl: null, isHouseAd: true };

function setup(opts: { killActive?: boolean; ad?: typeof ad | null } = {}) {
  let t = 0;
  const now = () => t;
  const adapter = new MockAdapter();
  const api = { serve: vi.fn().mockResolvedValue(opts.ad === undefined ? ad : opts.ad), sendEvent: vi.fn().mockResolvedValue(true) };
  const killswitch = { isActive: () => Boolean(opts.killActive) };
  const tracker = new ViewTracker(now);
  const orch = new Orchestrator({
    adapter, api: api as any, tracker, killswitch: killswitch as any, installId: "inst", now,
  });
  orch.start();
  return { adapter, api, orch, advance: (ms: number) => { t += ms; } };
}

describe("Orchestrator", () => {
  it("serves + renders on wait-start, then emits an impression with visibleMs on wait-end", async () => {
    const { adapter, api, advance } = setup();
    await adapter.fireWaitStart();
    expect(api.serve).toHaveBeenCalledWith("claude-code-terminal");
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
    expect(api.serve).not.toHaveBeenCalled();
    expect(adapter.lastRendered).toBeNull();
  });

  it("renders nothing when there is no ad inventory", async () => {
    const { adapter, api } = setup({ ad: null });
    await adapter.fireWaitStart();
    expect(api.serve).toHaveBeenCalled();
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
});
