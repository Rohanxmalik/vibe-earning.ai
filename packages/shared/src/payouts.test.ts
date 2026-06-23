import { describe, it, expect } from "vitest";
import { payoutDestinationSchema } from "./payouts";

describe("payoutDestinationSchema", () => {
  it("accepts a valid UPI destination", () => {
    expect(payoutDestinationSchema.safeParse({ method: "upi", vpa: "dev@okaxis" }).success).toBe(true);
  });
  it("accepts a valid bank destination", () => {
    expect(payoutDestinationSchema.safeParse({ method: "bank", accountNumber: "1234567890", ifsc: "HDFC0001" }).success).toBe(true);
  });
  it("rejects UPI without a vpa and bank without account/ifsc", () => {
    expect(payoutDestinationSchema.safeParse({ method: "upi" }).success).toBe(false);
    expect(payoutDestinationSchema.safeParse({ method: "bank", accountNumber: "1234567890" }).success).toBe(false);
  });
});
