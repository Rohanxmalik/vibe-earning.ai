import { describe, it, expect } from "vitest";
import { resolveSurface } from "./surface";

describe("resolveSurface", () => {
  it("defaults to claude-code-terminal when unset", () => {
    expect(resolveSurface(undefined)).toBe("claude-code-terminal");
  });
  it("accepts a known surface (e.g. Codex, Gemini)", () => {
    expect(resolveSurface("codex-panel")).toBe("codex-panel");
    expect(resolveSurface("gemini-cli-terminal")).toBe("gemini-cli-terminal");
  });
  it("falls back to the default for an unknown surface", () => {
    expect(resolveSurface("not-a-surface")).toBe("claude-code-terminal");
  });
});
