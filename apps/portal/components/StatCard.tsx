import type { ReactNode } from "react";

/** Dashboard stat card: small kicker, big value, optional footnote. */
export function StatCard({ kicker, value, foot, tone = "brand", title, children }: {
  kicker: string;
  value?: ReactNode;
  foot?: ReactNode;
  tone?: "brand" | "money" | "gold";
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`stat-card ${tone}`} title={title}>
      <div className="stat-kicker">{kicker}</div>
      {children ?? (
        <>
          <div className={`stat-big ${tone === "money" ? "money" : ""}`}>{value ?? "—"}</div>
          {foot && <div className="stat-foot">{foot}</div>}
        </>
      )}
    </div>
  );
}
