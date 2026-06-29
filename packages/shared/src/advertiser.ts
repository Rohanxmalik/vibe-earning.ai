import { z } from "zod";
import { surfaceSchema } from "./surfaces";

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

// Reusable brand-field validators.
const headlineField = z.string().trim().min(1).max(HEADLINE_MAX);
const taglineField = z.string().trim().max(TAGLINE_MAX);
const brandColorField = z.string().regex(/^#[0-9a-fA-F]{6}$/, "brand color must be a #RRGGBB hex");
const emojiField = z
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
    headline: headlineField.optional(),
    tagline: taglineField.optional(),
    brandColor: brandColorField.optional(),
    emoji: emojiField.optional(),
    url: z.string().url(),
    iconUrl: z.string().url().optional(),
    surface: surfaceSchema,
    bidPerBlockPaise: z.number().int().positive(),
    pacePerMinute: z.number().int().positive().optional(), // delivery cap (impressions/min)
  })
  .refine((d) => Boolean(d.copy || d.headline), { message: "copy_or_headline_required", path: ["headline"] });
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const editCampaignSchema = z
  .object({
    copy: z.string().min(3).max(60).optional(),
    headline: headlineField.nullable().optional(),
    tagline: taglineField.nullable().optional(),
    brandColor: brandColorField.nullable().optional(),
    emoji: emojiField.nullable().optional(),
    url: z.string().url().optional(),
    iconUrl: z.string().url().nullable().optional(),
    bidPerBlockPaise: z.number().int().positive().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "no_fields_to_update" });
export type EditCampaign = z.infer<typeof editCampaignSchema>;

export const buyBlocksSchema = z.object({ quantity: z.number().int().positive() });
export type BuyBlocks = z.infer<typeof buyBlocksSchema>;
