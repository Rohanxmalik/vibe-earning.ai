/** Format paise as rupees, e.g. 12345 -> "₹123.45". */
export function formatEarnings(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * The always-on status-bar earnings label: the lifetime total, plus a session delta (▲) that ticks
 * up as impressions bill during THIS window's run — a glanceable reward that pulls a look back
 * without nagging. The session delta is shown only when positive, so an idle session stays clean.
 */
export function formatStatusEarnings(lifetimePaise: number, sessionPaise: number): string {
  const base = `$(rocket) vibearning ${formatEarnings(lifetimePaise)}`;
  return sessionPaise > 0 ? `${base}  $(arrow-up)${formatEarnings(sessionPaise)}` : base;
}

/**
 * Session earnings = how much the lifetime total has grown since the first reading this run.
 * `baseline` is the lifetime captured at the start of the session (null until the first reading).
 * Clamped at 0 so a baseline reset / clock skew can never show a negative "earned this session".
 */
export function sessionEarned(lifetimePaise: number, baseline: number | null): number {
  return baseline === null ? 0 : Math.max(0, lifetimePaise - baseline);
}
