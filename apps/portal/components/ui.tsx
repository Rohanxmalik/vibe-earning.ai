"use client";
import type { ReactNode } from "react";
import type { DailySpend } from "../lib/api";

/** Accessible status message (screen readers announce it via aria-live). */
export function Alert({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live="polite">
      {children}
    </div>
  );
}

export interface TabDef<T extends string> { id: T; label: string }

/** Accessible tab strip (role=tablist / aria-selected). */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: TabDef<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab ${active === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <span className="spinner" role="status" aria-live="polite">{label}</span>;
}

/** A button that confirms a destructive action before firing. */
export function ConfirmButton({ message, onConfirm, className = "btn btn-danger btn-sm", children }: { message: string; onConfirm: () => void; className?: string; children: ReactNode }) {
  return (
    <button className={className} onClick={() => { if (window.confirm(message)) onConfirm(); }}>
      {children}
    </button>
  );
}

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/** Tiny dependency-free SVG bar chart of daily spend. */
export function SpendChart({ data }: { data: DailySpend[] }) {
  if (data.length === 0) return <p className="empty">No spend yet.</p>;
  const w = 320, h = 80, gap = 4;
  const max = Math.max(...data.map((d) => d.spendPaise), 1);
  const barW = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Daily spend chart">
      {data.map((d, i) => {
        const bh = Math.round((d.spendPaise / max) * h);
        const x = i * (barW + gap);
        return (
          <g key={d.date}>
            <rect x={x} y={h - bh} width={barW} height={bh} rx={2} fill="var(--brand)">
              <title>{`${d.date}: ${rupees(d.spendPaise)}`}</title>
            </rect>
            <text x={x + barW / 2} y={h + 12} textAnchor="middle" fontSize="7" fill="var(--muted)">{d.date.slice(5)}</text>
          </g>
        );
      })}
    </svg>
  );
}
