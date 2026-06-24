// Money + number + time formatting helpers (paise are the canonical unit on the API).

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Compact rupees for chart axes / tight spaces: ₹1.2k, ₹3.4L. */
export function rupeesShort(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(1)}k`;
  return `₹${r.toFixed(0)}`;
}

export function compactInt(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
}

export function timeAgo(input: string | number | Date): string {
  const d = new Date(input).getTime();
  const s = Math.max(0, Math.round((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(input).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Human countdown to a future timestamp: "resets in 8m", "resets in 22h 8m". */
export function resetsIn(input: string | number | Date | null | undefined): string {
  if (input == null) return "";
  const ms = new Date(input).getTime() - Date.now();
  if (ms <= 0) return "resets now";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `resets in ${m}m`;
  return `resets in ${h}h ${m}m`;
}
