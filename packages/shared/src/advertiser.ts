import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const advertiserRegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export type AdvertiserRegister = z.infer<typeof advertiserRegisterSchema>;

export const advertiserLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type AdvertiserLogin = z.infer<typeof advertiserLoginSchema>;

export const createCampaignSchema = z.object({
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().optional(),
  surface: surfaceSchema,
  bidPerBlockPaise: z.number().int().positive(),
  pacePerMinute: z.number().int().positive().optional(), // delivery cap (impressions/min)
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const editCampaignSchema = z
  .object({
    copy: z.string().min(3).max(60).optional(),
    url: z.string().url().optional(),
    iconUrl: z.string().url().nullable().optional(),
    bidPerBlockPaise: z.number().int().positive().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "no_fields_to_update" });
export type EditCampaign = z.infer<typeof editCampaignSchema>;

export const buyBlocksSchema = z.object({ quantity: z.number().int().positive() });
export type BuyBlocks = z.infer<typeof buyBlocksSchema>;
