// All thresholds are env-overridable. Defaults are placeholders — tune later (spec §8/§10).
export const minViewMs = () => Number(process.env.METRICS_MIN_VIEW_MS ?? 5000);
export const minImpressionGapMs = () => Number(process.env.METRICS_MIN_GAP_MS ?? 5000);
export const hourlyCap = () => Number(process.env.METRICS_HOURLY_CAP ?? 120);
export const dailyCap = () => Number(process.env.METRICS_DAILY_CAP ?? 600);
