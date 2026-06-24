"use client";
import { useMemo, useState } from "react";
import { rupees, timeAgo } from "../lib/format";

export interface LedgerRow {
  id: string;
  type: string;            // "impression" | "click" | ...
  campaign: string | null; // advertiser / campaign copy
  amountPaise: number;
  valid: boolean;
  createdAt: string;
}

/** Credited-events ledger with on-demand load, local search + type filter. */
export function LedgerTable({ rows, loaded, loading, onRetrieve }: {
  rows: LedgerRow[];
  loaded: boolean;
  loading: boolean;
  onRetrieve: () => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const types = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.type)))], [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (!needle) return true;
      return [r.campaign ?? "", r.type, r.id].some((s) => s.toLowerCase().includes(needle));
    });
  }, [rows, q, type]);

  if (!loaded) {
    return (
      <div className="empty-box">
        <p className="muted small" style={{ marginBottom: "0.9rem" }}>
          No activity loaded. Retrieving checks the last 500 credited events for this account.
        </p>
        <button className="btn btn-primary" onClick={onRetrieve} disabled={loading}>
          {loading ? "Retrieving…" : "Retrieve activity"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="ledger-toolbar">
        <input className="input" placeholder="Search advertiser, event id, event type…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activity" />
        <select className="input" style={{ maxWidth: 170 }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by event type">
          {types.map((t) => <option key={t} value={t}>{t === "all" ? "All events" : t}</option>)}
        </select>
        <span className="muted small spacer" style={{ textAlign: "right" }}>{filtered.length} of {rows.length} rows</span>
      </div>
      {filtered.length === 0 ? (
        <p className="empty">No matching events.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Advertiser</th>
                <th>Event</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="muted" title={new Date(r.createdAt).toLocaleString("en-IN")}>{timeAgo(r.createdAt)}</td>
                  <td>{r.campaign ?? <span className="muted">—</span>}</td>
                  <td><span className={`badge ${r.valid ? "badge-verified" : "badge-muted"}`}>{r.type}</span></td>
                  <td className="num">{r.amountPaise > 0 ? rupees(r.amountPaise) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
