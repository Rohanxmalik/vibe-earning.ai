"use client";

import Link from "next/link";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Developers", href: "/earnings" },
  { label: "Advertisers", href: "/campaigns" },
  { label: "FAQ", href: "/faq" },
];

/** Lowercase wordmark with a blinking terminal caret — the brand mark. */
export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={`flex items-baseline gap-1 text-xl font-bold tracking-tight ${inverted ? "text-white" : "text-[#15171E]"}`}
      style={{ fontFamily: "var(--font-display), sans-serif" }}
    >
      vibearning
      <span
        aria-hidden="true"
        className="inline-block h-[0.9em] w-[0.45em] translate-y-[0.08em] bg-[#FFB300] motion-safe:animate-[blink_1.2s_steps(2)_infinite]"
      />
    </span>
  );
}

/**
 * Paper navbar for the light header band (PageHeader / hero): ink links,
 * amber CTA, hairline rule underneath. Rendered in-flow at the top of every page.
 */
export function Navbar() {
  return (
    <nav className="kbi-tw relative z-50 mx-auto flex w-full max-w-[1440px] items-center justify-between border-b border-[#DBD9CF] px-6 py-5 md:px-10">
      <Link href="/" aria-label="vibearning home">
        <Wordmark />
      </Link>

      <div className="hidden items-center gap-6 md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="text-[13px] font-medium text-[#15171E]/70 transition-colors hover:text-[#15171E]"
          >
            {l.label}
          </Link>
        ))}
      </div>

      <Link
        href="/earnings"
        className="rounded-lg bg-[#FFB300] px-5 py-2 text-xs font-bold text-[#15171E] transition-colors hover:bg-[#E6A100] md:text-sm"
      >
        Start earning
      </Link>
    </nav>
  );
}
