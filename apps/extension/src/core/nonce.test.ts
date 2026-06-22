import { describe, it, expect } from "vitest";
import { makeNonce } from "./nonce";

describe("makeNonce", () => {
  it("is deterministic for the same wait-state", () => {
    expect(makeNonce("inst", "camp", 1000)).toBe(makeNonce("inst", "camp", 1000));
  });
  it("differs across wait-states", () => {
    expect(makeNonce("inst", "camp", 1000)).not.toBe(makeNonce("inst", "camp", 2000));
  });
  it("is at least 8 chars (api requires >=8)", () => {
    expect(makeNonce("i", "c", 1).length).toBeGreaterThanOrEqual(8);
  });
});
