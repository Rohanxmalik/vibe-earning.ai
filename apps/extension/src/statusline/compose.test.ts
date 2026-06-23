import { describe, it, expect } from "vitest";
import { composeStatusLine } from "./compose";
import type { ServeResponse } from "@kbi/shared";

const ad = (over: Partial<ServeResponse> = {}): ServeResponse => ({
  adId: "a1", campaignId: "c1", copy: "Ship faster with TurboDB", url: "https://turbodb.example.com/start", iconUrl: null, isHouseAd: false, ...over,
});

describe("composeStatusLine", () => {
  it("returns an empty string when there is no ad (let the agent's own status show)", () => {
    expect(composeStatusLine(null)).toBe("");
  });

  it("labels the line as sponsored and includes the copy + url host", () => {
    const line = composeStatusLine(ad());
    expect(line).toContain("Sponsored");
    expect(line).toContain("Ship faster with TurboDB");
    expect(line).toContain("turbodb.example.com");
  });

  it("truncates to the max length with an ellipsis", () => {
    const line = composeStatusLine(ad({ copy: "A".repeat(80) }), { maxLen: 40 });
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line.endsWith("…")).toBe(true);
  });

  it("marks house ads without the 'Sponsored' label (house ads aren't paid placements)", () => {
    const line = composeStatusLine(ad({ isHouseAd: true, copy: "Earn while your AI thinks" }));
    expect(line).not.toContain("Sponsored");
    expect(line).toContain("Earn while your AI thinks");
  });
});
