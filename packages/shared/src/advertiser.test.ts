import { describe, it, expect } from "vitest";
import { advertiserRegisterSchema, createCampaignSchema, editCampaignSchema, buyBlocksSchema, logoUrlSchema, isSafeLogoUrl, LOGO_MAX_BYTES, campaignSurfaces } from "./advertiser";

describe("advertiser schemas", () => {
  it("register requires email + 8-char password", () => {
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });
  it("createCampaign validates copy length, url, surface, positive bid", () => {
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 0 }).success).toBe(false);
  });
  it("createCampaign accepts a multi-surface `surfaces` array and requires at least one surface", () => {
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surfaces: ["claude-code-panel", "codex-panel"], bidPerBlockPaise: 20000 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surfaces: [], bidPerBlockPaise: 20000 }).success).toBe(false); // empty array
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", bidPerBlockPaise: 20000 }).success).toBe(false); // neither surface nor surfaces
  });
  it("campaignSurfaces normalizes surfaces[]/surface and dedupes", () => {
    expect(campaignSurfaces({ surfaces: ["claude-code-panel", "codex-panel"] })).toEqual(["claude-code-panel", "codex-panel"]);
    expect(campaignSurfaces({ surface: "codex-panel" })).toEqual(["codex-panel"]); // legacy single
    expect(campaignSurfaces({ surfaces: ["codex-panel", "codex-panel"] })).toEqual(["codex-panel"]); // dedupe
    expect(campaignSurfaces({})).toEqual([]);
  });
  it("createCampaign accepts structured brand fields", () => {
    const ok = createCampaignSchema.safeParse({
      copy: "Zomato — Delivering Happiness", headline: "Zomato", tagline: "Delivering Happiness",
      emoji: "🍔", brandColor: "#E23744", url: "https://zomato.com", surface: "codex-panel", bidPerBlockPaise: 20000,
    });
    expect(ok.success).toBe(true);
  });
  it("logoUrlSchema accepts https + small data:image, rejects http/oversize/junk", () => {
    expect(logoUrlSchema.safeParse("https://cdn.acme.com/logo.png").success).toBe(true);
    expect(logoUrlSchema.safeParse("data:image/png;base64,iVBORw0KGgo=").success).toBe(true);
    expect(logoUrlSchema.safeParse("http://localhost:3000/uploads/x.png").success).toBe(true); // dev object storage
    expect(logoUrlSchema.safeParse("http://insecure.acme.com/logo.png").success).toBe(false);
    expect(logoUrlSchema.safeParse("data:text/html;base64,PHNjcmlwdD4=").success).toBe(false); // not an image
    expect(logoUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    const huge = "data:image/png;base64," + "A".repeat(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 200);
    expect(logoUrlSchema.safeParse(huge).success).toBe(false); // over the 32KB cap
  });
  it("isSafeLogoUrl mirrors the schema for the portal form", () => {
    expect(isSafeLogoUrl("https://x.dev/a.png")).toBe(true);
    expect(isSafeLogoUrl("not a url")).toBe(false);
    expect(isSafeLogoUrl(null)).toBe(false);
    expect(isSafeLogoUrl("")).toBe(false);
  });
  it("createCampaign accepts an uploaded data-URI logo and rejects an http one", () => {
    const base = { headline: "Zomato", url: "https://zomato.com", surface: "codex-panel" as const, bidPerBlockPaise: 20000 };
    expect(createCampaignSchema.safeParse({ ...base, iconUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ ...base, iconUrl: "http://x.dev/l.png" }).success).toBe(false);
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
