import * as React from "react";
import { Navbar } from "./Navbar";
import { ui, displayFont } from "./kit";

/**
 * Paper header band for inner pages: navbar + mono eyebrow + ink display title.
 * Pure new-design markup (safe under `.kbi-tw`). Put the page's functional body
 * (forms / dashboards / legacy widgets) BELOW this, outside `.kbi-tw`.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="kbi-tw relative overflow-hidden bg-[#F2F1EB] text-[#15171E]">
      <div className={`pointer-events-none absolute inset-0 ${ui.gridBg}`} />
      <div className="relative z-10">
        <Navbar />
        <div className="mx-auto max-w-[1000px] px-6 pb-14 pt-10 text-center md:pb-20 md:pt-14">
          {eyebrow && (
            <p className="mb-5">
              <span className={ui.eyebrow}>{eyebrow}</span>
            </p>
          )}
          <h1
            className="text-4xl font-extrabold leading-[1.02] tracking-tight md:text-6xl"
            style={{ fontFamily: displayFont }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mx-auto mt-5 max-w-2xl text-base font-medium text-[#15171E]/65 md:text-lg">{subtitle}</p>
          )}
          {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
          {children}
        </div>
      </div>
    </header>
  );
}
