/** Minimal request shape we need to infer a country, without storing anything. */
export interface GeoRequest {
  account?: { country?: string | null } | null;
  headers?: Record<string, unknown>;
}

/**
 * Best-effort ISO-3166 alpha-2 country for payout eligibility. Prefers the account's
 * stored country, then ONLY a CDN-managed geo header (Vercel / Cloudflare) that the edge
 * sets and overwrites. The old `x-country` fallback was dropped: it was an
 * application-invented header a direct client could spoof (`X-Country: IN`) to falsely
 * pass India-only payout eligibility. This is an on-the-spot lookup only — the raw IP is
 * never read or stored here. NOTE: the edge/proxy MUST strip any client-supplied copies of
 * these headers before they reach the app for them to be trustworthy.
 */
export function countryFromRequest(req: GeoRequest): string | null {
  const stored = req.account?.country;
  if (typeof stored === "string" && stored.length === 2) return stored.toUpperCase();

  const h = req.headers ?? {};
  const header = h["x-vercel-ip-country"] ?? h["cf-ipcountry"];
  if (typeof header === "string") {
    const c = header.trim().toUpperCase();
    if (c.length === 2 && c !== "XX") return c;
  }
  return null;
}
