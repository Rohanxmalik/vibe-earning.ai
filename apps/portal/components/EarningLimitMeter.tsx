import { resetsIn } from "../lib/format";

export interface LimitRow { name: string; count: number; cap: number; resetAt?: string | number | null }

/** Hourly / daily earning-limit progress meters with reset countdowns. */
export function EarningLimitMeter({ rows }: { rows: LimitRow[] }) {
  return (
    <div>
      {rows.map((r) => {
        const pct = r.cap > 0 ? Math.min(100, Math.round((r.count / r.cap) * 100)) : 0;
        return (
          <div className="meter" key={r.name}>
            <div className="meter-row">
              <span className="meter-name">{r.name}</span>
              <span className="meter-val">{r.count} / {r.cap}</span>
            </div>
            <div className="meter-track" role="progressbar" aria-valuenow={r.count} aria-valuemin={0} aria-valuemax={r.cap} aria-label={`${r.name} usage`}>
              <div className="meter-fill" style={{ width: `${pct}%` }} />
            </div>
            {r.resetAt != null && <div className="meter-reset">{resetsIn(r.resetAt)}</div>}
          </div>
        );
      })}
    </div>
  );
}
