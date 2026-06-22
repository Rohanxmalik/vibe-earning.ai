import { describe, it, expect } from "vitest";
import { allAdapters, firstAvailable } from "./registry";
import { MockAdapter } from "../core/mockAdapter";

describe("adapter registry", () => {
  it("lists the three real adapters", () => {
    expect(allAdapters().map((a) => a.surface).sort()).toEqual(
      ["claude-code-terminal", "codex-panel", "gemini-cli-terminal"],
    );
  });
  it("falls back to a provided default when none are available", () => {
    const fallback = new MockAdapter();
    expect(firstAvailable(fallback)).toBe(fallback); // stubs are all unavailable for now
  });
});
