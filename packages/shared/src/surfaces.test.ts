import { describe, it, expect } from "vitest";
import { SURFACES, surfaceSchema } from "./surfaces";

describe("surfaces", () => {
  it("includes the three launch surfaces", () => {
    expect(SURFACES).toEqual([
      "claude-code-panel",
      "claude-code-terminal",
      "codex-panel",
      "gemini-cli-terminal",
    ]);
  });

  it("accepts a valid surface and rejects junk", () => {
    expect(surfaceSchema.safeParse("codex-panel").success).toBe(true);
    expect(surfaceSchema.safeParse("cursor").success).toBe(false);
  });
});
