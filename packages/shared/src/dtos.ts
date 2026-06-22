import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const serveQuerySchema = z.object({
  surface: surfaceSchema,
  installId: z.string().min(1).optional(),
});
export type ServeQuery = z.infer<typeof serveQuerySchema>;

export const serveResponseSchema = z.object({
  adId: z.string(),
  campaignId: z.string(),
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().nullable(),
  isHouseAd: z.boolean(),
});
export type ServeResponse = z.infer<typeof serveResponseSchema>;
