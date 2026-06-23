import { z } from "zod";

export const googleLoginSchema = z.object({ idToken: z.string().min(10) });
export type GoogleLogin = z.infer<typeof googleLoginSchema>;

// Email/password onboarding for developers (web), parallel to advertiser auth.
export const devRegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export type DevRegister = z.infer<typeof devRegisterSchema>;

export const devLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type DevLogin = z.infer<typeof devLoginSchema>;

export const accountSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  type: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

export const authTokenResponseSchema = z.object({ token: z.string(), account: accountSchema });
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
