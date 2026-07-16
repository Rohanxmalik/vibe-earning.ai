import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (admin API key, webhook tokens). Compares SHA-256
 * digests so inputs of different lengths don't leak length via early return, and the byte compare
 * itself is timing-safe. Returns false for null/undefined/empty candidates.
 */
export function secureEquals(candidate: string | null | undefined, expected: string | null | undefined): boolean {
  if (!candidate || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
