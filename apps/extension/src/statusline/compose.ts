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

/**
 * Compose the single sponsored line shown in Claude Code's status line.
 * Paid ads carry a "Sponsored" label (disclosure); house ads don't. Returns ""
 * when there's no ad so the agent's own status line shows through unchanged.
 */
export function composeStatusLine(ad: ServeResponse | null, opts: ComposeOpts = {}): string {
  if (!ad) return "";
  const maxLen = opts.maxLen ?? 60;
  const h = host(ad.url);
  const label = ad.isHouseAd ? "" : "Sponsored: ";
  const tail = h ? ` · ${h}` : "";
  const line = `${label}${ad.copy}${tail}`;
  if (line.length <= maxLen) return line;
  return line.slice(0, Math.max(0, maxLen - 1)) + "…";
}
