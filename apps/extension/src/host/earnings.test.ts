import { describe, it, expect } from "vitest";
import { formatEarnings, formatStatusEarnings, sessionEarned } from "./earnings";

describe("formatEarnings", () => {
  it("renders paise as ₹ with two decimals", () => {
    expect(formatEarnings(0)).toBe("₹0.00");
    expect(formatEarnings(12345)).toBe("₹123.45");
  });
});

describe("formatStatusEarnings", () => {
  it("shows lifetime only when nothing earned this session", () => {
    expect(formatStatusEarnings(12345, 0)).toBe("$(rocket) vibearning ₹123.45");
  });

  it("appends a ▲ session ticker when this session has earned", () => {
    expect(formatStatusEarnings(12345, 230)).toBe("$(rocket) vibearning ₹123.45  $(arrow-up)₹2.30");
  });
});

describe("sessionEarned", () => {
  it("is 0 until a baseline is captured", () => {
    expect(sessionEarned(5000, null)).toBe(0);
  });

  it("is the growth since the baseline", () => {
    expect(sessionEarned(5230, 5000)).toBe(230);
  });

  it("never goes negative if the lifetime reading drops below the baseline", () => {
    expect(sessionEarned(4900, 5000)).toBe(0);
  });
});
