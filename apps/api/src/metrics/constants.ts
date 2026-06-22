// All thresholds are env-overridable. Defaults are placeholders — tune later (spec §8/§10).
export const minViewMs = () => Number(process.env.METRICS_MIN_VIEW_MS ?? 5000);
export const minImpressionGapMs = () => Number(process.env.METRICS_MIN_GAP_MS ?? 5000);
export const hourlyCap = () => Number(process.env.METRICS_HOURLY_CAP ?? 120);
export const dailyCap = () => Number(process.env.METRICS_DAILY_CAP ?? 600);

// Fraud: IP-hash clustering. Once more than this many DISTINCT installs share one
// source IP within the window, further events from that IP are flagged ip_cluster.
export const maxInstallsPerIp = () => Number(process.env.FRAUD_IP_MAX_INSTALLS ?? 5);
export const ipClusterWindowSec = () => Number(process.env.FRAUD_IP_WINDOW_SEC ?? 3600);
