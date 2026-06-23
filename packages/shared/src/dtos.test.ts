import { describe, it, expect } from "vitest";
import { serveQuerySchema } from "./dtos";

describe("serveQuerySchema count", () => {
  it("defaults count to 1 when omitted", () => {
    const r = serveQuerySchema.parse({ surface: "codex-panel" });
    expect(r.count).toBe(1);
  });
  it("coerces a string query param to a number", () => {
    const r = serveQuerySchema.parse({ surface: "codex-panel", count: "3" });
    expect(r.count).toBe(3);
  });
  it("rejects counts above 3 and below 1", () => {
    expect(serveQuerySchema.safeParse({ surface: "codex-panel", count: "4" }).success).toBe(false);
    expect(serveQuerySchema.safeParse({ surface: "codex-panel", count: "0" }).success).toBe(false);
  });
});
