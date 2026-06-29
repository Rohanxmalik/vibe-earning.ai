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

  it("renders headline — tagline when structured fields are set (copy is ignored)", () => {
    const line = composeStatusLine(ad({ copy: "ignored", headline: "Zomato", tagline: "Delivering Happiness" }));
    expect(line).toBe("Sponsored: Zomato — Delivering Happiness · turbodb.example.com");
  });

  it("renders just the headline when there is no tagline", () => {
    const line = composeStatusLine(ad({ headline: "Zepto", tagline: null }));
    expect(line).toContain("Sponsored: Zepto ·");
    expect(line).not.toContain("—");
  });

  it("prefixes the brand emoji ahead of the disclosure label", () => {
    const line = composeStatusLine(ad({ emoji: "🍔", headline: "Zomato", tagline: "Delivering Happiness" }));
    expect(line).toBe("🍔 Sponsored: Zomato — Delivering Happiness · turbodb.example.com");
  });

  it("keeps a full tagline visible under the default cap (status bar auto-widens)", () => {
    const line = composeStatusLine(ad({ headline: "A".repeat(20), tagline: "B".repeat(40) }));
    expect(line).toContain("B".repeat(40)); // not truncated
  });
});
