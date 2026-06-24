import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared design tokens for the Kickbacks-India "blue & lime" UI.
 *
 * IMPORTANT (cascade rules): the portal still ships a hand-written legacy CSS
 * design system in app/globals.css. Tailwind's reset is scoped to `.kbi-tw`
 * (see globals.css). So:
 *   - Wrap any NEW Tailwind markup in an element whose className includes `kbi-tw`.
 *   - NEVER place legacy components (StatCard, LedgerTable, MetricChart, BidMarket,
 *     SpinnerDemo, Accordion, Ticker, anything from components/ui.tsx) or legacy
 *     class markup (.card/.btn/.input/.field/.list/.table) INSIDE a `.kbi-tw` element.
 *     Keep them as siblings; plain Tailwind layout utilities (bg/padding/flex/grid/
 *     max-w/text) are safe to use without `kbi-tw`.
 */

export const BRAND = "#0038FF";
export const NAVY = "#001A99";
export const LIME = "#CCFF00";

export const displayFont = '"Arial Black", Impact, sans-serif';

/** Heavy stacked 3D shadow for the hero display type. */
export const displayShadow =
  "1px 1px 0 #001A99,2px 2px 0 #001A99,3px 3px 0 #001A99,4px 4px 0 #001A99,5px 5px 0 #001A99,6px 6px 0 #001A99,7px 7px 0 #001A99,8px 8px 0 #001A99,9px 9px 0 #001A99,10px 10px 0 #001A99";

/** Lighter shadow for inner-page headings. */
export const displayShadowSm = "2px 2px 0 #001A99,4px 4px 0 #001A99";

export const ui = {
  /** Faint white grid used on blue surfaces. */
  gridBg:
    "bg-[linear-gradient(to_right,#ffffff15_1px,transparent_1px),linear-gradient(to_bottom,#ffffff15_1px,transparent_1px)] bg-[size:4rem_4rem]",

  // Buttons
  btnLime:
    "inline-flex items-center justify-center rounded-full bg-[#CCFF00] text-black font-bold px-6 py-3 text-sm shadow-lg transition-transform hover:scale-[1.03] active:scale-95",
  btnOutlineWhite:
    "inline-flex items-center justify-center rounded-full border border-white text-white font-semibold px-6 py-3 text-sm transition-colors hover:bg-white hover:text-[#0038FF]",
  btnBlue:
    "inline-flex items-center justify-center rounded-full bg-[#0038FF] text-white font-bold px-6 py-3 text-sm shadow-lg transition-colors hover:bg-[#001A99]",
  btnOutlineDark:
    "inline-flex items-center justify-center rounded-full border border-black/15 text-black font-semibold px-6 py-3 text-sm transition-colors hover:bg-black/5",

  // Surfaces
  card: "rounded-[2rem] bg-white border border-black/5 shadow-[0_10px_40px_rgba(0,0,0,0.06)] p-8",
  cardMuted: "rounded-[2rem] bg-[#F4F6FF] border border-black/5 p-8",

  // Text
  eyebrow:
    "inline-block rounded-full bg-[#CCFF00] text-black text-[11px] font-black uppercase tracking-[0.12em] px-3 py-1",
  eyebrowOutline:
    "inline-block rounded-full border border-black/15 text-black/70 text-[11px] font-black uppercase tracking-[0.12em] px-3 py-1",
  sectionTitle: "text-3xl md:text-5xl font-black tracking-tight uppercase leading-[0.95]",
  sectionSub: "mt-4 text-base md:text-lg text-black/60 font-medium",
};

export function Eyebrow({
  children,
  variant = "lime",
  className,
}: {
  children: React.ReactNode;
  variant?: "lime" | "outline";
  className?: string;
}) {
  return <span className={cn(variant === "lime" ? ui.eyebrow : ui.eyebrowOutline, className)}>{children}</span>;
}

/** Centered section heading block (new design). Render its parent without `kbi-tw`
 *  and place legacy widgets as siblings of this block. */
export function SectionHeading({
  eyebrow,
  title,
  sub,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("kbi-tw text-center", className)}>
      {eyebrow && (
        <p className="mb-4">
          <Eyebrow>{eyebrow}</Eyebrow>
        </p>
      )}
      <h2 className={cn(ui.sectionTitle, "text-black")}>{title}</h2>
      {sub && <p className={cn(ui.sectionSub, "mx-auto max-w-2xl")}>{sub}</p>}
    </div>
  );
}
