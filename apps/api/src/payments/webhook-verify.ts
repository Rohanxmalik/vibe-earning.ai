import { createHmac, timingSafeEqual } from "crypto";

/** Constant-time string compare; false on length mismatch (avoids throwing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Razorpay webhook signature: hex HMAC-SHA256 of the raw body keyed by the webhook secret. */
export function razorpaySignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyRazorpaySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  return safeEqual(razorpaySignature(rawBody, secret), signature);
}

export interface StripeVerifyOpts {
  toleranceSec?: number;
  nowMs?: number;
}

/**
 * Stripe webhook signature ("Stripe-Signature: t=...,v1=..."). HMAC-SHA256 of
 * `${t}.${rawBody}` keyed by the signing secret, plus a replay-window check on t.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  opts: StripeVerifyOpts = {},
): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  if (!safeEqual(expected, v1)) return false;

  const tolerance = opts.toleranceSec ?? 300;
  const nowSec = (opts.nowMs ?? Date.now()) / 1000;
  return Math.abs(nowSec - Number(t)) <= tolerance;
}
