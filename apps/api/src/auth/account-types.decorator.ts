import { SetMetadata } from "@nestjs/common";

export const ACCOUNT_TYPES_KEY = "accountTypes";

/**
 * Restrict a controller (or handler) to specific account types (M2). Without this, a `dev` token
 * could call `/advertiser/*` (create campaigns, spend) and an `advertiser` token could hit the
 * developer payout endpoints — AuthGuard only proved *authentication*, never the right *role*.
 * Opt-in: AuthGuard enforces the check only where this decorator is present, so shared endpoints
 * (e.g. /me, /auth/me) are unaffected.
 */
export const AccountTypes = (...types: string[]) => SetMetadata(ACCOUNT_TYPES_KEY, types);
