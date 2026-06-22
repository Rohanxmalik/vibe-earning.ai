// Dev revenue share in basis points (5000 = 50.00%). Env-overridable / tunable.
export const devShareBps = () => Number(process.env.LEDGER_DEV_SHARE_BPS ?? 5000);
