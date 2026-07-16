// Dev revenue share in basis points (5000 = 50.00%). Env-overridable / tunable.
export const devShareBps = () => Number(process.env.LEDGER_DEV_SHARE_BPS ?? 5000);

// Referral program: the referrer earns this share (in bps) of the PLATFORM's cut on a referred
// dev's earnings — so it's funded from platform revenue and never reduces the referee's payout.
// Default 1000 = 10%. Applies only for `referralWindowDays` after the referral.
export const referralBps = () => Number(process.env.LEDGER_REFERRAL_BPS ?? 1000);
export const referralWindowDays = () => Number(process.env.LEDGER_REFERRAL_WINDOW_DAYS ?? 90);
