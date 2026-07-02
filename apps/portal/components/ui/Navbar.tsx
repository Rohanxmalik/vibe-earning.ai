"use client";

import Link from "next/link";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Developers", href: "/earnings" },
  { label: "Advertisers", href: "/campaigns" },
  { label: "FAQ", href: "/faq" },
];

/**
 * Transparent navbar designed to sit over a blue grid header (PageHeader / hero).
 * White text + lime accents. Rendered in-flow at the top of every page's blue band.
 */
export function Navbar() {
  return (
    <nav className="kbi-tw relative z-50 mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 md:px-10 md:py-8">
      <Link href="/" className="flex items-center gap-1" aria-label="vibearning home">
        <span className="relative rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-xs font-black tracking-tight text-black shadow-sm md:text-sm">
          KICK
          <span
            className="absolute -bottom-1.5 left-0 h-3 w-3 bg-white"
            style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
        </span>
        <span className="rounded-full border-[1.5px] border-white bg-[#CCFF00] px-3 py-1.5 text-xs font-black text-black shadow-sm md:text-sm">
          BACKS
        </span>
      </Link>

      <div className="hidden items-center space-x-2 md:flex">
        {LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="rounded-full border border-white/30 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          >
            {l.label}
          </Link>
        ))}
      </div>

      <Link
        href="/earnings"
        className="rounded-full border border-white px-6 py-2 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-[#0038FF] md:text-sm"
      >
        Start earning
      </Link>
    </nav>
  );
}
