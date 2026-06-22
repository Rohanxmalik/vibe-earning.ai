import { describe, it, expect, vi } from "vitest";
import { MockAdapter } from "./mockAdapter";

describe("MockAdapter", () => {
  it("fires wait handlers on demand and records render/clear", () => {
    const a = new MockAdapter();
    const onWaitStart = vi.fn();
    const onWaitEnd = vi.fn();
    const dispose = a.start({ onWaitStart, onWaitEnd });

    a.fireWaitStart();
    expect(onWaitStart).toHaveBeenCalledOnce();

    a.render({ adId: "a", campaignId: "c", copy: "x", url: "https://x.dev", iconUrl: null, isHouseAd: true });
    expect(a.lastRendered?.campaignId).toBe("c");

    a.fireWaitEnd();
    expect(onWaitEnd).toHaveBeenCalledOnce();

    a.clear();
    expect(a.lastRendered).toBeNull();

    dispose(); // no throw
  });

  it("is always available", () => {
    expect(new MockAdapter().isAvailable()).toBe(true);
  });
});
