import { z } from "zod";

export const googleLoginSchema = z.object({ idToken: z.string().min(10) });
export type GoogleLogin = z.infer<typeof googleLoginSchema>;

export const accountSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  type: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

export const authTokenResponseSchema = z.object({ token: z.string(), account: accountSchema });
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
