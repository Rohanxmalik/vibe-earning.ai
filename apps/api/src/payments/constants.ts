// Minimum payout in paise (₹100 default). Env-overridable.
export const payoutMinPaise = () => Number(process.env.PAYOUT_MIN_PAISE ?? 10000);

// --- Fast-launch payout guardrails (all default to OFF so dev/tests are unchanged; prod turns
// them on to bound the blast radius of the not-yet-fully-hardened fraud path — see plan Phase 0). ---

// First-cash-out safety hold: an account younger than this many days cannot request a payout.
// 0 disables it. Prod sets e.g. 7 while impression-token binding + IP trust harden (C2/C3).
export const payoutHoldDays = () => Number(process.env.PAYOUT_HOLD_DAYS ?? 0);

// Per-account daily payout ceiling in paise (0 = disabled). A compromised or fabricated account
// can't cash out more than this in a rolling day.
export const payoutDailyCapPaise = () => Number(process.env.PAYOUT_DAILY_CAP_PAISE ?? 0);

// When "true", payouts are created in a "requested" state and dispatched to the PSP only after an
// admin approves (POST /admin/payouts/:id/approve). Default false → immediate dispatch (dev/test).
export const payoutRequireApproval = () => (process.env.PAYOUT_REQUIRE_APPROVAL ?? "false") === "true";
