import { describe, it, expect } from "vitest";
import { advertiserRegisterSchema, createCampaignSchema, editCampaignSchema, buyBlocksSchema } from "./advertiser";

describe("advertiser schemas", () => {
  it("register requires email + 8-char password", () => {
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });
  it("createCampaign validates copy length, url, surface, positive bid", () => {
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 0 }).success).toBe(false);
  });
  it("createCampaign accepts structured brand fields", () => {
    const ok = createCampaignSchema.safeParse({
      copy: "Zomato — Delivering Happiness", headline: "Zomato", tagline: "Delivering Happiness",
      emoji: "🍔", brandColor: "#E23744", url: "https://zomato.com", surface: "codex-panel", bidPerBlockPaise: 20000,
    });
    expect(ok.success).toBe(true);
  });
  it("createCampaign rejects a too-long headline and a non-hex brand color", () => {
    const base = { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" as const, bidPerBlockPaise: 20000 };
    expect(createCampaignSchema.safeParse({ ...base, headline: "A".repeat(21) }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...base, brandColor: "red" }).success).toBe(false);
  });
  it("emoji field accepts one emoji (incl. a flag) and rejects text or multiple emoji", () => {
    const base = { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" as const, bidPerBlockPaise: 20000 };
    expect(createCampaignSchema.safeParse({ ...base, emoji: "🍔" }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ ...base, emoji: "🇮🇳" }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ ...base, emoji: "ab" }).success).toBe(false); // plain text
    expect(createCampaignSchema.safeParse({ ...base, emoji: "🍔⚡" }).success).toBe(false); // two emoji
  });
  it("createCampaign requires copy or headline (refine)", () => {
    expect(createCampaignSchema.safeParse({ url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ headline: "Zomato", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(true);
  });
  it("editCampaign allows nulling brand fields and rejects an empty patch", () => {
    expect(editCampaignSchema.safeParse({ tagline: null, emoji: null, brandColor: null }).success).toBe(true);
    expect(editCampaignSchema.safeParse({}).success).toBe(false);
  });
  it("buyBlocks requires a positive integer quantity", () => {
    expect(buyBlocksSchema.safeParse({ quantity: 5 }).success).toBe(true);
    expect(buyBlocksSchema.safeParse({ quantity: 0 }).success).toBe(false);
  });
});
