import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared design tokens for the vibearning "paper & phosphor" UI.
 *
 * Identity: warm khadi-paper page, near-black ink, and a single amber-phosphor
 * accent (the color of the terminal where the product actually lives). Display
 * type is Bricolage Grotesque; data/labels are IBM Plex Mono (fonts are wired
 * up as CSS variables in app/layout.tsx via next/font).
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
 *
 * NOTE: some token names (btnLime, btnBlue, btnOutlineWhite) predate the rebrand
 * and are kept so existing call sites restyle automatically — read them as
 * primary / dark / on-dark-outline.
 */

export const PAPER = "#F2F1EB";
export const INK = "#15171E";
export const PHOSPHOR = "#FFB300";
export const PAID_GREEN = "#1E7A4F";
export const RULE = "#DBD9CF";

export const displayFont = 'var(--font-display), "Bricolage Grotesque", "Segoe UI", sans-serif';
export const monoFont = 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace';

/** Shadows retired with the rebrand — flat ink on paper. Kept for compat. */
export const displayShadow = "none";
export const displayShadowSm = "none";

export const ui = {
  /** Faint ink grid used on paper surfaces (was a white grid on blue). */
  gridBg:
    "bg-[linear-gradient(to_right,#15171E0A_1px,transparent_1px),linear-gradient(to_bottom,#15171E0A_1px,transparent_1px)] bg-[size:4rem_4rem]",

  // Buttons — rectangular, quiet radius; amber = act, ink = secondary dark.
  /** Primary CTA: amber phosphor. (Legacy name — no longer lime.) */
  btnLime:
    "inline-flex items-center justify-center rounded-lg bg-[#FFB300] text-[#15171E] font-bold px-6 py-3 text-sm transition-colors hover:bg-[#E6A100] active:translate-y-px",
  /** Outline for dark surfaces. */
  btnOutlineWhite:
    "inline-flex items-center justify-center rounded-lg border border-white/30 text-white font-semibold px-6 py-3 text-sm transition-colors hover:border-white hover:bg-white/10",
  /** Solid dark button. (Legacy name — now ink, not blue.) */
  btnBlue:
    "inline-flex items-center justify-center rounded-lg bg-[#15171E] text-white font-bold px-6 py-3 text-sm transition-colors hover:bg-black",
  btnOutlineDark:
    "inline-flex items-center justify-center rounded-lg border border-[#15171E]/25 text-[#15171E] font-semibold px-6 py-3 text-sm transition-colors hover:bg-[#15171E] hover:text-white",

  // Surfaces
  card: "rounded-2xl bg-white border border-[#DBD9CF] p-8",
  cardMuted: "rounded-2xl bg-[#F2F1EB] border border-[#DBD9CF] p-8",

  // Text
  /** Mono bracket eyebrow — terminal register, replaces the lime pill. */
  eyebrow:
    "inline-block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#15171E]/60 [font-family:var(--font-mono),monospace] before:content-['['] before:mr-1.5 before:text-[#FFB300] after:content-[']'] after:ml-1.5 after:text-[#FFB300]",
  eyebrowOutline:
    "inline-block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#15171E]/60 [font-family:var(--font-mono),monospace] before:content-['['] before:mr-1.5 before:text-[#FFB300] after:content-[']'] after:ml-1.5 after:text-[#FFB300]",
  sectionTitle:
    "text-3xl md:text-5xl font-extrabold tracking-tight leading-[1.02] [font-family:var(--font-display),sans-serif]",
  sectionSub: "mt-4 text-base md:text-lg text-[#15171E]/60 font-medium",
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
      <h2 className={cn(ui.sectionTitle, "text-[#15171E]")}>{title}</h2>
      {sub && <p className={cn(ui.sectionSub, "mx-auto max-w-2xl")}>{sub}</p>}
    </div>
  );
}
