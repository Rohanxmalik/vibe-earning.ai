import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const serveQuerySchema = z.object({
  surface: surfaceSchema,
  installId: z.string().min(1).optional(),
  // How many ads to return for in-spinner rotation (1 = classic single ad).
  count: z.coerce.number().int().min(1).max(3).default(1),
});
export type ServeQuery = z.infer<typeof serveQuerySchema>;

export const serveResponseSchema = z.object({
  adId: z.string(),
  campaignId: z.string(),
  copy: z.string().min(3).max(60),
  // Structured creative. When `headline` is set the line renders "headline — tagline";
  // otherwise it falls back to `copy`. All optional so the envelope stays backward-compatible.
  headline: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  brandColor: z.string().nullable().optional(), // hex tint for the status-bar line
  emoji: z.string().nullable().optional(), // single brand emoji prefixed to the line
  url: z.string().url(),
  iconUrl: z.string().url().nullable(),
  isHouseAd: z.boolean(),
});
export type ServeResponse = z.infer<typeof serveResponseSchema>;
