import type { ServeResponse } from "@vibearning/shared";

export interface ComposeOpts {
  /** Hard cap on the rendered line length (terminal status lines are narrow). */
  maxLen?: number;
  /**
   * Whether to bold via Unicode math-bold glyphs (default true). The VS Code editor status bar
   * can't render ANSI/markdown, so it needs the glyphs. Terminals (Claude Code's status line)
   * render true ANSI bold — pass `bold: false` there and apply ANSI bold instead (cleaner,
   * font-independent, copy-paste-safe).
   */
  bold?: boolean;
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
 * VS Code's status bar renders plain text (no markdown/bold), so to make the line visually bold we
 * map ASCII letters/digits to their Unicode **Mathematical Sans-Serif Bold** glyphs, which the
 * status-bar font renders as bold. Non-ASCII (emoji) and spaces/punctuation pass through unchanged.
 */
export function boldText(text: string): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x41 && c <= 0x5a) out += String.fromCodePoint(0x1d5d4 + (c - 0x41)); // A-Z
    else if (c >= 0x61 && c <= 0x7a) out += String.fromCodePoint(0x1d5ee + (c - 0x61)); // a-z
    else if (c >= 0x30 && c <= 0x39) out += String.fromCodePoint(0x1d7ec + (c - 0x30)); // 0-9
    else out += ch;
  }
  return out;
}

/** The creative body: "Headline — Tagline" when structured fields are set, else the legacy copy. */
function body(ad: ServeResponse): string {
  if (ad.headline) return ad.tagline ? `${ad.headline} — ${ad.tagline}` : ad.headline;
  return ad.copy;
}

/**
 * Compose the single sponsored line shown in Claude Code's status line, e.g.
 * "🍔 Sponsored: Zomato — Delivering Happiness · zomato.com" — rendered fully **bold**.
 * An optional brand emoji leads; paid ads carry a "Sponsored" label (disclosure), house ads
 * don't; the URL host trails. The status bar auto-widens, so the default cap is generous enough
 * to keep a brand's tagline visible. We truncate on the PLAIN (visible) length, then bold the
 * whole line — bold glyphs are one visual column each, so width is preserved. Returns "" when
 * there's no ad so the agent's own status line shows through unchanged.
 */
export function composeStatusLine(ad: ServeResponse | null, opts: ComposeOpts = {}): string {
  if (!ad) return "";
  const maxLen = opts.maxLen ?? 120;
  const h = host(ad.url);
  const lead = ad.emoji ? `${ad.emoji} ` : "";
  const label = ad.isHouseAd ? "" : "Sponsored: ";
  const tail = h ? ` · ${h}` : "";
  const plain = `${lead}${label}${body(ad)}${tail}`;
  const visible = Array.from(plain); // count by code point, not UTF-16 unit
  const clamped = visible.length <= maxLen ? plain : visible.slice(0, Math.max(0, maxLen - 1)).join("") + "…";
  // Unicode math-bold for surfaces that can't do ANSI (VS Code status bar); plain when the caller
  // will apply real ANSI bold (terminal). Emoji + punctuation pass through either way.
  return opts.bold === false ? clamped : boldText(clamped);
}
