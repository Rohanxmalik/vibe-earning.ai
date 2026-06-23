import { describe, it, expect } from "vitest";
import { decideBilling, type BillingState } from "./billing";
import type { ServeResponse } from "@kbi/shared";

const ad = (over: Partial<ServeResponse> = {}): ServeResponse => ({
  adId: "a1", campaignId: "c1", copy: "TurboDB", url: "https://x.dev", iconUrl: null, isHouseAd: false, ...over,
});
const fresh = (): BillingState => ({ installId: "inst1", current: null });

describe("decideBilling (conservative status-line billing)", () => {
  it("tracks a newly-shown ad but does NOT bill on first sight", () => {
    const { nextState, bill } = decideBilling(fresh(), ad(), 1000);
    expect(bill).toBeNull();
    expect(nextState.current).toMatchObject({ campaignId: "c1", firstShownMs: 1000, billed: false });
    expect(nextState.current?.nonce).toBeTruthy();
  });

  it("does not bill until the ad has been shown for the minimum view time", () => {
    const s1 = decideBilling(fresh(), ad(), 1000).nextState;
    const { nextState, bill } = decideBilling(s1, ad(), 1000 + 4000, 5000); // only 4s elapsed
    expect(bill).toBeNull();
    expect(nextState.current?.firstShownMs).toBe(1000); // window preserved, not reset
  });

  it("bills exactly once after the minimum view time, with visibleMs and a stable nonce", () => {
    const s1 = decideBilling(fresh(), ad(), 1000).nextState;
    const { nextState, bill } = decideBilling(s1, ad(), 1000 + 5000, 5000);
    expect(bill).toMatchObject({ installId: "inst1", campaignId: "c1", type: "impression", visibleMs: 5000 });
    expect(bill?.nonce).toBe(s1.current?.nonce); // same nonce the server dedupes on
    expect(nextState.current?.billed).toBe(true);
  });

  it("does not double-bill the same shown window on later refreshes", () => {
    const s1 = decideBilling(fresh(), ad(), 1000).nextState;
    const s2 = decideBilling(s1, ad(), 6000, 5000).nextState; // billed here
    const { bill } = decideBilling(s2, ad(), 12000, 5000); // later refresh, same ad
    expect(bill).toBeNull();
  });

  it("starts a new billable window when the ad changes to a different campaign", () => {
    const s1 = decideBilling(fresh(), ad(), 1000).nextState;
    const s2 = decideBilling(s1, ad(), 6000, 5000).nextState; // c1 billed
    const { nextState, bill } = decideBilling(s2, ad({ campaignId: "c2", adId: "a2" }), 7000, 5000);
    expect(bill).toBeNull(); // new ad, fresh window — not billed yet
    expect(nextState.current).toMatchObject({ campaignId: "c2", firstShownMs: 7000, billed: false });
  });

  it("never bills a house ad", () => {
    const s1 = decideBilling(fresh(), ad({ isHouseAd: true }), 1000).nextState;
    const { bill } = decideBilling(s1, ad({ isHouseAd: true }), 100000, 5000);
    expect(bill).toBeNull();
  });

  it("clears the current ad when nothing is served", () => {
    const s1 = decideBilling(fresh(), ad(), 1000).nextState;
    const { nextState, bill } = decideBilling(s1, null, 2000);
    expect(bill).toBeNull();
    expect(nextState.current).toBeNull();
  });
});
