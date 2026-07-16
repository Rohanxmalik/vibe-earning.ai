import * as bcrypt from "bcryptjs";

/**
 * bcrypt work factor. 12 follows current OWASP guidance (the old value of 8 was ~16x
 * cheaper to brute-force). Override with BCRYPT_COST only to lower it in tests where the
 * hashing cost would otherwise dominate runtime.
 */
export const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 12);

// A precomputed hash of a random string. When an account (or its passwordHash) doesn't
// exist we still run a compare against this so "no such account" and "wrong password" take
// the same time — removes the login timing side-channel that leaks which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("vibearning-timing-equalizer", BCRYPT_COST);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Constant-ish-time password check. Pass the stored hash (or null/undefined when the account
 * doesn't exist) — a missing hash still performs a real bcrypt compare against a dummy so the
 * response time doesn't reveal account existence. Returns false whenever the hash is absent.
 */
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return Boolean(hash) && ok;
}
