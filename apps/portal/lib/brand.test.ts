import { describe, it, expect } from "vitest";
import { firstEmoji, deriveCopy, brandPreview, lowContrastWarning } from "./brand";

describe("firstEmoji", () => {
  it("keeps a single emoji", () => {
    expect(firstEmoji("🍔")).toBe("🍔");
  });
  it("caps a run of emoji to the first one", () => {
    expect(firstEmoji("🍔⚡🛒")).toBe("🍔");
  });
  it("returns empty for empty/whitespace input", () => {
    expect(firstEmoji("   ")).toBe("");
    expect(firstEmoji("")).toBe("");
  });
});

describe("deriveCopy", () => {
  it("joins headline and tagline with an em dash", () => {
    expect(deriveCopy("Zomato", "Delivering Happiness")).toBe("Zomato — Delivering Happiness");
  });
  it("uses just the headline when there is no tagline", () => {
    expect(deriveCopy("Zepto", "")).toBe("Zepto");
  });
  it("clamps the derived copy to 60 chars", () => {
    expect(deriveCopy("A".repeat(20), "B".repeat(40)).length).toBeLessThanOrEqual(60);
  });
  it("trims surrounding whitespace", () => {
    expect(deriveCopy("  Blinkit  ", "  Blink and it's there ")).toBe("Blinkit — Blink and it's there");
  });
});

describe("brandPreview", () => {
  it("builds emoji + headline — tagline + host", () => {
    expect(brandPreview({ emoji: "🍔", headline: "Zomato", tagline: "Delivering Happiness", url: "https://zomato.com" }))
      .toBe("🍔 Zomato — Delivering Happiness · zomato.com");
  });
  it("falls back to copy when there is no headline", () => {
    expect(brandPreview({ copy: "Legacy line", url: "https://x.dev" })).toBe("Legacy line · x.dev");
  });
  it("omits the host on a half-typed URL", () => {
    expect(brandPreview({ headline: "Zepto", url: "https:/" })).toBe("Zepto");
  });
});

describe("lowContrastWarning", () => {
  it("flags near-white and near-black", () => {
    expect(lowContrastWarning("#FFFFFF")).toMatch(/light/);
    expect(lowContrastWarning("#000000")).toMatch(/dark/);
  });
  it("passes a normal brand color", () => {
    expect(lowContrastWarning("#E23744")).toBeNull(); // Zomato red
    expect(lowContrastWarning("#2563EB")).toBeNull(); // portal blue
  });
  it("returns null for a malformed hex", () => {
    expect(lowContrastWarning("red")).toBeNull();
  });
});
