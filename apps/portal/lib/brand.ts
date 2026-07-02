// Brand-creative helpers shared by the campaign form and list. The status bar renders a
// structured line ("emoji headline — tagline · host"); we mirror that here for the preview
// and derive the legacy single-line `copy` the API still stores.

// Logo helpers/types live in @vibearning/shared so the portal and the API validate identically.
export { deriveCopy, isSafeLogoUrl, LOGO_MAX_BYTES, ACCEPTED_LOGO_TYPES } from "@vibearning/shared";

import { LOGO_MAX_BYTES as LOGO_BYTES, ACCEPTED_LOGO_TYPES as TYPES } from "@vibearning/shared";

/** Validate an uploaded logo file by mime + byte size; returns an error message or null if OK. */
export function logoFileError(file: { type: string; size: number }): string | null {
  if (!(TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPG, GIF, WebP, or SVG image.";
  if (file.size > LOGO_BYTES) return `Image is too large (max ${Math.round(LOGO_BYTES / 1024)}KB).`;
  return null;
}

/** First grapheme of a string (so an emoji picker is capped to exactly one emoji). */
export function firstEmoji(input: string): string {
  const s = input.trim();
  if (!s) return "";
  // Intl.Segmenter groups ZWJ/flag sequences into one grapheme; fall back to a code point.
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    for (const { segment } of seg.segment(s)) return segment;
    return "";
  }
  return Array.from(s)[0] ?? "";
}

/**
 * Warn (don't mangle) when a brand color sits at a luminance extreme that can disappear against
 * the status-bar background on one theme. The bar's background is theme-dependent and unknown to
 * us, so we only flag the risky extremes and leave the advertiser's color intact.
 */
export function lowContrastWarning(hex: string): string | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0 (black) .. 1 (white)
  if (lum > 0.85) return "Very light — may be hard to read on light editor themes.";
  if (lum < 0.12) return "Very dark — may be hard to read on dark editor themes.";
  return null;
}

/** Host of a URL, best-effort (no throw on a half-typed URL). */
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** The status-bar-style preview line for a campaign's creative (no "Sponsored:" label). */
export function brandPreview(fields: { emoji?: string; headline?: string; tagline?: string; copy?: string; url?: string }): string {
  const lead = fields.emoji ? `${fields.emoji} ` : "";
  const bodyText = fields.headline
    ? fields.tagline
      ? `${fields.headline} — ${fields.tagline}`
      : fields.headline
    : fields.copy ?? "";
  const h = fields.url ? host(fields.url) : "";
  const tail = h ? ` · ${h}` : "";
  return `${lead}${bodyText}${tail}`.trim();
}
