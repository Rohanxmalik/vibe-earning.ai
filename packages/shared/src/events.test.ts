import { describe, it, expect } from "vitest";
import { eventIngestSchema } from "./events";

const base = {
  installId: "inst_1", campaignId: "camp_1", surface: "codex-panel",
  type: "impression", nonce: "abcd1234", visibleMs: 6000,
};

describe("eventIngestSchema", () => {
  it("accepts a valid impression event", () => {
    expect(eventIngestSchema.safeParse(base).success).toBe(true);
  });
  it("rejects an unknown event type", () => {
    expect(eventIngestSchema.safeParse({ ...base, type: "scroll" }).success).toBe(false);
  });
  it("rejects a too-short nonce", () => {
    expect(eventIngestSchema.safeParse({ ...base, nonce: "x" }).success).toBe(false);
  });
  it("defaults visibleMs to 0 when omitted", () => {
    const { visibleMs, ...noVis } = base;
    const parsed = eventIngestSchema.parse(noVis);
    expect(parsed.visibleMs).toBe(0);
  });
});
