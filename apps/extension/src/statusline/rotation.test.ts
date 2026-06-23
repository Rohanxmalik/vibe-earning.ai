import { describe, it, expect } from "vitest";
import { tickRotation } from "./billing";
import type { BillingState } from "./billing";
import type { ServeResponse } from "@kbi/shared";

const ad = (campaignId: string): ServeResponse => ({
  adId: `ad_${campaignId}`, campaignId, copy: `copy ${campaignId}`, url: "https://x.dev", iconUrl: null, isHouseAd: false,
});
const fresh = (): BillingState => ({ installId: "inst1", current: null });
const three = [ad("c1"), ad("c2"), ad("c3")];

describe("tickRotation (top-N status-line rotation)", () => {
  it("shows nothing and clears state when no ads are served", () => {
    const { ad: shown, bill, nextState } = tickRotation(fresh(), [], 1000);
    expect(shown).toBeNull();
    expect(bill).toBeNull();
    expect(nextState.current).toBeNull();
  });

  it("starts on the top ad and opens its window", () => {
    const { ad: shown, bill, nextState } = tickRotation(fresh(), three, 1000);
    expect(shown?.campaignId).toBe("c1");
    expect(bill).toBeNull();
    expect(nextState.current).toMatchObject({ campaignId: "c1", firstShownMs: 1000 });
  });

  it("holds the same ad before holdMs and bills it once at the view threshold", () => {
    const s0 = tickRotation(fresh(), three, 1000, { holdMs: 8000 }).nextState;
    const r = tickRotation(s0, three, 6000, { holdMs: 8000, minViewMs: 5000 }); // 5s elapsed < 8s hold
    expect(r.ad?.campaignId).toBe("c1"); // still c1
    expect(r.bill).toMatchObject({ campaignId: "c1", visibleMs: 5000 });
  });

  it("rotates to the next ad after holdMs", () => {
    const s0 = tickRotation(fresh(), three, 1000, { holdMs: 8000 }).nextState;
    const s1 = tickRotation(s0, three, 6000, { holdMs: 8000 }).nextState; // bill c1, still showing c1
    const r = tickRotation(s1, three, 9001, { holdMs: 8000 }); // 8001ms elapsed → rotate
    expect(r.ad?.campaignId).toBe("c2");
    expect(r.bill).toBeNull(); // fresh window for c2
    expect(r.nextState.current).toMatchObject({ campaignId: "c2", firstShownMs: 9001, billed: false });
  });

  it("cycles from the last ad back to the first", () => {
    const onC3: BillingState = { installId: "inst1", current: { campaignId: "c3", adId: "ad_c3", firstShownMs: 1000, nonce: "n", billed: true } };
    const r = tickRotation(onC3, three, 1000 + 9000, { holdMs: 8000 });
    expect(r.ad?.campaignId).toBe("c1");
  });

  it("never rotates when only one ad is available", () => {
    const one = [ad("c1")];
    const s0 = tickRotation(fresh(), one, 1000, { holdMs: 8000 }).nextState;
    const r = tickRotation(s0, one, 100000, { holdMs: 8000 }); // way past hold
    expect(r.ad?.campaignId).toBe("c1");
  });
});
