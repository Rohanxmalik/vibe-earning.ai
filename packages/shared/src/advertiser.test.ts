import { describe, it, expect } from "vitest";
import { advertiserRegisterSchema, createCampaignSchema, buyBlocksSchema } from "./advertiser";

describe("advertiser schemas", () => {
  it("register requires email + 8-char password", () => {
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });
  it("createCampaign validates copy length, url, surface, positive bid", () => {
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 0 }).success).toBe(false);
  });
  it("buyBlocks requires a positive integer quantity", () => {
    expect(buyBlocksSchema.safeParse({ quantity: 5 }).success).toBe(true);
    expect(buyBlocksSchema.safeParse({ quantity: 0 }).success).toBe(false);
  });
});
