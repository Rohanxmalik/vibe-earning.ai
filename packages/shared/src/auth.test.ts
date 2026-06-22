import { describe, it, expect } from "vitest";
import { googleLoginSchema } from "./auth";

describe("googleLoginSchema", () => {
  it("accepts an idToken", () => {
    expect(googleLoginSchema.safeParse({ idToken: "a".repeat(20) }).success).toBe(true);
  });
  it("rejects a missing/short idToken", () => {
    expect(googleLoginSchema.safeParse({ idToken: "x" }).success).toBe(false);
    expect(googleLoginSchema.safeParse({}).success).toBe(false);
  });
});
