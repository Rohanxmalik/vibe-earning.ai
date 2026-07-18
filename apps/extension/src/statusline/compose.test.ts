import { describe, it, expect } from "vitest";
import { composeStatusLine, boldText } from "./compose";
import type { ServeResponse } from "@vibearning/shared";

const ad = (over: Partial<ServeResponse> = {}): ServeResponse => ({
  adId: "a1", campaignId: "c1", copy: "Ship faster with TurboDB", url: "https://turbodb.example.com/start", iconUrl: null, isHouseAd: false, ...over,
});

describe("composeStatusLine", () => {
  it("returns an empty string when there is no ad (let the agent's own status show)", () => {
    expect(composeStatusLine(null)).toBe("");
  });

  it("labels the line as sponsored and includes the copy + url host (all bold)", () => {
    const line = composeStatusLine(ad());
    expect(line).toContain(boldText("Sponsored"));
    expect(line).toContain(boldText("Ship faster with TurboDB"));
    expect(line).toContain(boldText("turbodb.example.com"));
  });

  it("truncates to the max VISIBLE length with an ellipsis", () => {
    const line = composeStatusLine(ad({ copy: "A".repeat(80) }), { maxLen: 40 });
    expect(Array.from(line).length).toBeLessThanOrEqual(40); // count code points (bold glyph = 1)
    expect(line.endsWith("…")).toBe(true);
  });

  it("marks house ads without the 'Sponsored' label (house ads aren't paid placements)", () => {
    const line = composeStatusLine(ad({ isHouseAd: true, copy: "Earn while your AI thinks" }));
    expect(line).not.toContain(boldText("Sponsored"));
    expect(line).toContain(boldText("Earn while your AI thinks"));
  });

  it("renders headline — tagline when structured fields are set (copy is ignored), fully bold", () => {
    const line = composeStatusLine(ad({ copy: "ignored", headline: "Zomato", tagline: "Delivering Happiness" }));
    expect(line).toBe(boldText("Sponsored: Zomato — Delivering Happiness · turbodb.example.com"));
  });

  it("renders just the headline when there is no tagline", () => {
    const line = composeStatusLine(ad({ headline: "Zepto", tagline: null }));
    expect(line).toContain(boldText("Sponsored: Zepto ·"));
    expect(line).not.toContain("—");
  });

  it("prefixes the brand emoji ahead of the disclosure label", () => {
    const line = composeStatusLine(ad({ emoji: "🍔", headline: "Zomato", tagline: "Delivering Happiness" }));
    expect(line).toBe(boldText("🍔 Sponsored: Zomato — Delivering Happiness · turbodb.example.com"));
  });

  it("bolds the entire line (Unicode math-bold), leaving emoji/punctuation untouched", () => {
    expect(boldText("Zomato")).not.toBe("Zomato");
    expect(Array.from(boldText("Zomato"))).toHaveLength(6); // one math-bold glyph per letter
    expect(boldText("Zomato").codePointAt(0)).toBe(0x1d5ed); // Sans-Serif Bold 'Z'
    expect(boldText("a b.")).toContain(" "); // spaces/punctuation pass through
    expect(boldText("a b.")).toContain("."); // punctuation can't bold — passes through
    const line = composeStatusLine(ad({ emoji: "🍔", headline: "Zomato", tagline: "Delivering Happiness" }));
    expect(line).toContain("🍔"); // emoji passes through unchanged
    expect(line).not.toContain("Delivering"); // plain text is gone — it's bold now
  });

  it("bold:false returns plain text (for terminals that apply real ANSI bold instead)", () => {
    const line = composeStatusLine(ad({ headline: "Zomato", tagline: "Delivering Happiness" }), { bold: false });
    expect(line).toBe("Sponsored: Zomato — Delivering Happiness · turbodb.example.com");
    expect(line).not.toBe(boldText(line)); // not Unicode-bolded
  });

  it("keeps a full tagline visible under the default cap (status bar auto-widens)", () => {
    const line = composeStatusLine(ad({ headline: "A".repeat(20), tagline: "B".repeat(40) }));
    expect(line).toContain(boldText("B".repeat(40))); // not truncated
  });
});
