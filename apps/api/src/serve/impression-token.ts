import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-issued impression tokens (C2/H2 fix).
 *
 * Problem: `/events` used to accept any client-chosen (installId, campaignId, nonce), so anyone
 * could POST fabricated impressions/clicks and drain a campaign's escrow or credit their own dev
 * account. Nothing tied an event to an ad the server had actually served.
 *
 * Fix: `/serve` mints, for each returned ad, a short-lived HMAC token over
 * `${campaignId}|${surface}|${issuedAtMs}`. `/events` must present the matching token; the server
 * recomputes the HMAC and rejects anything it didn't sign or that has expired. The secret never
 * leaves the API, so tokens can't be forged.
 */

const TTL_MS = Number(process.env.EVENTS_TOKEN_TTL_MS ?? 600_000); // 10 minutes
const CLOCK_SKEW_MS = 60_000; // tolerate a small future-dated skew

function secret(): string {
  // AUTH_JWT_SECRET is already required in production (docker-compose.prod.yml guards it), so the
  // dev fallback below can only ever be hit locally.
  return process.env.EVENTS_TOKEN_SECRET || process.env.AUTH_JWT_SECRET || "dev-events-secret";
}

function sign(campaignId: string, surface: string, issuedAtMs: number): string {
  return createHmac("sha256", secret()).update(`${campaignId}|${surface}|${issuedAtMs}`).digest("hex");
}

/** Token format: `${issuedAtMs}.${hmacHex}`. Opaque to the client — it just echoes it back. */
export function issueImpressionToken(campaignId: string, surface: string, issuedAtMs: number = Date.now()): string {
  return `${issuedAtMs}.${sign(campaignId, surface, issuedAtMs)}`;
}

/** True iff `token` was issued by us for this exact (campaignId, surface) and hasn't expired. */
export function verifyImpressionToken(
  token: string | undefined | null,
  campaignId: string,
  surface: string,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAtMs = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (now - issuedAtMs > TTL_MS) return false; // expired
  if (issuedAtMs - now > CLOCK_SKEW_MS) return false; // implausibly future-dated
  const expected = sign(campaignId, surface, issuedAtMs);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whether a valid token is REQUIRED for an event to be credited. Default true (secure). Set
 * EVENTS_REQUIRE_TOKEN=false only where events legitimately can't carry one (e.g. the test suite).
 * A present-but-invalid token is always rejected regardless of this flag.
 */
export function eventsRequireToken(): boolean {
  return process.env.EVENTS_REQUIRE_TOKEN !== "false";
}
