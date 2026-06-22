import { createHmac } from "crypto";
import { razorpaySignature, verifyRazorpaySignature, verifyStripeSignature } from "./webhook-verify";

describe("razorpay signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "payment.captured", payload: { x: 1 } });

  it("accepts a correctly signed body", () => {
    expect(verifyRazorpaySignature(body, razorpaySignature(body, secret), secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    const sig = razorpaySignature(body, secret);
    expect(verifyRazorpaySignature(body + " ", sig, secret)).toBe(false);
  });
  it("rejects a wrong secret and a missing signature", () => {
    expect(verifyRazorpaySignature(body, razorpaySignature(body, "other"), secret)).toBe(false);
    expect(verifyRazorpaySignature(body, undefined, secret)).toBe(false);
  });
});

describe("stripe signature", () => {
  const secret = "whsec_stripe";
  const body = JSON.stringify({ type: "payment_intent.succeeded", data: { object: { id: "pi_1" } } });
  const sign = (t: number, payload = body, sec = secret) =>
    `t=${t},v1=${createHmac("sha256", sec).update(`${t}.${payload}`).digest("hex")}`;

  it("accepts a fresh, correctly signed event", () => {
    const t = 1_700_000_000;
    expect(verifyStripeSignature(body, sign(t), secret, { nowMs: t * 1000 })).toBe(true);
  });
  it("rejects an event outside the tolerance window", () => {
    const t = 1_700_000_000;
    expect(verifyStripeSignature(body, sign(t), secret, { nowMs: (t + 9999) * 1000 })).toBe(false);
  });
  it("rejects a bad signature, wrong secret and malformed header", () => {
    const t = 1_700_000_000;
    expect(verifyStripeSignature(body, sign(t, body, "nope"), secret, { nowMs: t * 1000 })).toBe(false);
    expect(verifyStripeSignature(body + "x", sign(t), secret, { nowMs: t * 1000 })).toBe(false);
    expect(verifyStripeSignature(body, "garbage", secret, { nowMs: t * 1000 })).toBe(false);
    expect(verifyStripeSignature(body, undefined, secret)).toBe(false);
  });
});
