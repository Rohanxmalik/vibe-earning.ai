import { z } from "zod";
import { surfaceSchema, SURFACES, type Surface } from "./surfaces";

export const advertiserRegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export type AdvertiserRegister = z.infer<typeof advertiserRegisterSchema>;

export const advertiserLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type AdvertiserLogin = z.infer<typeof advertiserLoginSchema>;

// Per-field creative caps (shared so the portal form and server validate identically).
export const HEADLINE_MAX = 20; // brand name, e.g. "Zomato"
export const TAGLINE_MAX = 40; // short slogan, e.g. "Delivering Happiness"
export const EMOJI_MAX = 8; // a single emoji can be a multi-codepoint ZWJ sequence

// Only emoji code points (pictographic + components/ZWJ + regional-indicator flags) — rejects
// plain text like "abc" that would otherwise fit the length cap.
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍\u{1F1E6}-\u{1F1FF}]+$/u;

/** Grapheme count, so "emoji" is capped to exactly one (ZWJ sequences count as one). */
function graphemeCount(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (!Seg) return Array.from(s).length;
  let n = 0;
  for (const _ of new Seg(undefined, { granularity: "grapheme" }).segment(s)) n += 1;
  return n;
}

// Reusable brand-field validators — exported so EVERY path (advertiser create/edit AND the
// admin house-ad endpoint) validates brand fields identically.
export const headlineSchema = z.string().trim().min(1).max(HEADLINE_MAX);
export const taglineSchema = z.string().trim().max(TAGLINE_MAX);
export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "brand color must be a #RRGGBB hex");

// Brand logo. Advertisers can either paste an https URL or upload a small image (stored inline as a
// base64 data URI). Because a data-URI logo travels in EVERY /serve response, we cap it tightly.
export const LOGO_MAX_BYTES = 32 * 1024; // 32KB of image bytes
// base64 inflates ~4/3, plus the "data:image/...;base64," prefix.
const LOGO_MAX_CHARS = Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 64;
const LOGO_DATA_URI = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/i;
// Object storage returns a URL on the API's own origin. In prod that's https (allowed below); in
// local dev it's http://localhost:<port>, which we also allow — a logo URL is only ever loaded
// client-side as an <img>, never server-fetched, so there's no SSRF surface here.
const LOGO_HTTP_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/.+/i;
/** A logo is an https (or localhost) URL or a small inline data:image URI (mirrors the webview CSP). */
export const logoUrlSchema = z
  .string()
  .trim()
  .max(LOGO_MAX_CHARS, "logo image is too large (max 32KB)")
  .refine(
    (v) => /^https:\/\/.+/i.test(v) || LOGO_HTTP_LOCAL.test(v) || LOGO_DATA_URI.test(v),
    "logo must be an https URL or an uploaded image",
  );
/** True if the value is an acceptable logo (used by the portal form for live validation/preview). */
export function isSafeLogoUrl(v: string | null | undefined): boolean {
  return v ? logoUrlSchema.safeParse(v).success : false;
}

/** Image MIME types accepted for an uploaded logo (rendered via <img>, so SVG scripting can't run). */
export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"] as const;
export type LogoMimeType = (typeof ACCEPTED_LOGO_TYPES)[number];

const LOGO_EXT: Record<LogoMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
/** File extension for a logo MIME type (used to name the stored object). */
export function logoExtFor(contentType: string): string {
  return LOGO_EXT[contentType as LogoMimeType] ?? "bin";
}

/**
 * Parse a base64 `data:image/…` URI into its MIME type, raw base64 and decoded byte length —
 * shared so the portal and the upload endpoint agree on what's valid. Returns null for anything
 * that isn't a base64 image data URI (caller then rejects it).
 */
export function parseImageDataUrl(
  dataUrl: string,
): { contentType: LogoMimeType; base64: string; byteLength: number } | null {
  const m = /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl.trim());
  if (!m) return null;
  const contentType = m[1].toLowerCase().replace("image/jpg", "image/jpeg") as LogoMimeType;
  if (!ACCEPTED_LOGO_TYPES.includes(contentType)) return null;
  const base64 = m[2];
  const pad = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - pad;
  return { contentType, base64, byteLength };
}
export const emojiSchema = z
  .string()
  .trim()
  .min(1)
  .max(EMOJI_MAX)
  .regex(EMOJI_ONLY, "must be a single emoji")
  .refine((s) => graphemeCount(s) === 1, { message: "must be a single emoji" });

/**
 * The legacy single-line `copy` derived from the structured fields, e.g.
 * "Zomato — Delivering Happiness". Clamped to 60 chars (the column's cap); the full tagline
 * still renders in the status bar via the structured headline/tagline fields. Shared so the
 * portal preview and the server derive it identically.
 */
export function deriveCopy(headline?: string | null, tagline?: string | null): string {
  const h = (headline ?? "").trim().slice(0, HEADLINE_MAX);
  const t = (tagline ?? "").trim().slice(0, TAGLINE_MAX);
  const line = t ? `${h} — ${t}` : h;
  return line.slice(0, 60);
}

export const createCampaignSchema = z
  .object({
    // Optional: the portal sends the structured fields and lets the server derive `copy`.
    // Copy-only callers (and tests) still work unchanged.
    copy: z.string().min(3).max(60).optional(),
    headline: headlineSchema.optional(),
    tagline: taglineSchema.optional(),
    brandColor: brandColorSchema.optional(),
    emoji: emojiSchema.optional(),
    url: z.string().url(),
    iconUrl: logoUrlSchema.optional(),
    // A campaign can target one or more spinner surfaces (Claude Code, Codex, …). We create one
    // bid per surface so it serves everywhere selected. `surface` (single) is kept for back-compat.
    surface: surfaceSchema.optional(),
    surfaces: z.array(surfaceSchema).min(1).max(SURFACES.length).optional(),
    bidPerBlockPaise: z.number().int().positive(),
    pacePerMinute: z.number().int().positive().optional(), // delivery cap (impressions/min)
  })
  .refine((d) => Boolean(d.copy || d.headline), { message: "copy_or_headline_required", path: ["headline"] })
  .refine((d) => Boolean(d.surface || (d.surfaces && d.surfaces.length > 0)), { message: "surface_required", path: ["surfaces"] });
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

/** Deduped target surfaces for a create DTO — accepts `surfaces[]` or the legacy single `surface`. */
export function campaignSurfaces(dto: { surface?: Surface | null; surfaces?: Surface[] | null }): Surface[] {
  const list = dto.surfaces && dto.surfaces.length > 0 ? dto.surfaces : dto.surface ? [dto.surface] : [];
  return Array.from(new Set(list));
}

export const editCampaignSchema = z
  .object({
    copy: z.string().min(3).max(60).optional(),
    headline: headlineSchema.nullable().optional(),
    tagline: taglineSchema.nullable().optional(),
    brandColor: brandColorSchema.nullable().optional(),
    emoji: emojiSchema.nullable().optional(),
    url: z.string().url().optional(),
    iconUrl: logoUrlSchema.nullable().optional(),
    bidPerBlockPaise: z.number().int().positive().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "no_fields_to_update" });
export type EditCampaign = z.infer<typeof editCampaignSchema>;

export const buyBlocksSchema = z.object({ quantity: z.number().int().positive() });
export type BuyBlocks = z.infer<typeof buyBlocksSchema>;
