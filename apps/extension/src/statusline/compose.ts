import type { ServeResponse } from "@kbi/shared";

export interface ComposeOpts {
  /** Hard cap on the rendered line length (terminal status lines are narrow). */
  maxLen?: number;
}

/** Best-effort host extraction (no throw on a malformed URL). */
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** The creative body: "Headline — Tagline" when structured fields are set, else the legacy copy. */
function body(ad: ServeResponse): string {
  if (ad.headline) return ad.tagline ? `${ad.headline} — ${ad.tagline}` : ad.headline;
  return ad.copy;
}

/**
 * Compose the single sponsored line shown in Claude Code's status line, e.g.
 * "🍔 Sponsored: Zomato — Delivering Happiness · zomato.com". An optional brand emoji
 * leads; paid ads carry a "Sponsored" label (disclosure), house ads don't; the URL host
 * trails. The status bar auto-widens, so the default cap is generous enough to keep a
 * brand's tagline visible. Returns "" when there's no ad so the agent's own status line
 * shows through unchanged.
 */
export function composeStatusLine(ad: ServeResponse | null, opts: ComposeOpts = {}): string {
  if (!ad) return "";
  const maxLen = opts.maxLen ?? 120;
  const h = host(ad.url);
  const lead = ad.emoji ? `${ad.emoji} ` : "";
  const label = ad.isHouseAd ? "" : "Sponsored: ";
  const tail = h ? ` · ${h}` : "";
  const line = `${lead}${label}${body(ad)}${tail}`;
  if (line.length <= maxLen) return line;
  return line.slice(0, Math.max(0, maxLen - 1)) + "…";
}
