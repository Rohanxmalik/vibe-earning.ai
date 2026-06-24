"use client";
import { useState, type ReactNode } from "react";

export interface FaqEntry { q: string; a: ReactNode; group?: string }

function Chevron() {
  return (
    <svg className="acc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Item({ entry, defaultOpen }: { entry: FaqEntry; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`acc-item ${open ? "open" : ""}`}>
      <button className="acc-q" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{entry.q}</span>
        <Chevron />
      </button>
      {open && <div className="acc-a">{entry.a}</div>}
    </div>
  );
}

/** Grouped accordion. Renders an uppercase label whenever the group changes. */
export function Accordion({ items, openFirst }: { items: FaqEntry[]; openFirst?: boolean }) {
  let lastGroup: string | undefined;
  return (
    <div>
      {items.map((entry, i) => {
        const showLabel = entry.group && entry.group !== lastGroup;
        lastGroup = entry.group;
        return (
          <div key={i}>
            {showLabel && <div className="acc-group-label">{entry.group}</div>}
            <Item entry={entry} defaultOpen={openFirst && i === 0} />
          </div>
        );
      })}
    </div>
  );
}
