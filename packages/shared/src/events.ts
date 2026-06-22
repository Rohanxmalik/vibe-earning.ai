import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const EVENT_TYPES = ["impression", "click"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeSchema = z.enum(EVENT_TYPES);

export const eventIngestSchema = z.object({
  installId: z.string().min(1),
  campaignId: z.string().min(1),
  surface: surfaceSchema,
  type: eventTypeSchema,
  nonce: z.string().min(8),
  visibleMs: z.number().int().min(0).default(0),
});
export type EventIngest = z.infer<typeof eventIngestSchema>;

export const eventResultSchema = z.object({
  deduped: z.boolean(),
  valid: z.boolean(),
  reason: z.string().nullable(),
});
export type EventResult = z.infer<typeof eventResultSchema>;
