// Minimum payout in paise (₹100 default). Env-overridable.
export const payoutMinPaise = () => Number(process.env.PAYOUT_MIN_PAISE ?? 10000);
