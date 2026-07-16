"use client";

import React from "react";
import Link from "next/link";
import { Navbar } from "./Navbar";
import { ui, displayFont, PAID_GREEN } from "./kit";
import { CopyButton } from "../CopyButton";

const INSTALL_CMD = "code --install-extension vibearning.vsix";

/**
 * Rotation shown inside the hero terminal: real agent verbs, then an illustrative sponsored line.
 * The sponsored frames are deliberately "Place your ad here" placeholders — no advertiser has
 * paid yet, so we never show a real brand as if it were a customer. It doubles as an advertiser CTA.
 */
const SPINNER_FRAMES: { text: string; sponsored: boolean }[] = [
  { text: "Thinking…", sponsored: false },
  { text: "Place your ad here — advertise with vibearning", sponsored: true },
  { text: "Simmering…", sponsored: false },
  { text: "Your brand — one tasteful line while devs wait", sponsored: true },
  { text: "Brewing…", sponsored: false },
];

/**
 * The signature element: a live terminal where the "thinking…" spinner line
 * cycles into sponsored lines — the product, shown doing its job.
 * Falls back to a static sponsored frame when reduced motion is requested.
 */
function TerminalDemo() {
  const [frame, setFrame] = React.useState(0);
  const [seconds, setSeconds] = React.useState(7);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(1); // static sponsored frame
      return;
    }
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
      setSeconds((s) => (s % 53) + 3);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  const current = SPINNER_FRAMES[frame];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-black/60 bg-[#15171E] text-left shadow-[0_24px_60px_-24px_rgba(21,23,30,0.5)]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-2 font-mono text-[11px] text-white/40">claude code — ~/work/api</span>
      </div>

      <div className="space-y-2 px-5 py-5 font-mono text-[13px] leading-relaxed">
        <p className="text-white/45">&gt; fix the flaky payment webhook test</p>
        <p aria-live="polite">
          <span className={current.sponsored ? "text-[#FFB300]" : "text-white/70"}>✳ {current.text}</span>
          <span className="text-white/35">
            {" "}
            ({seconds}s{current.sponsored ? " · sponsored" : " · esc to interrupt"})
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 font-mono text-[12px]">
        <span className="flex items-center gap-2 text-white/50">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: PAID_GREEN }} />
          you keep 50%
        </span>
        <span className="text-white/50">paid over UPI · in INR</span>
      </div>
    </div>
  );
}

/** Home hero in the paper-and-phosphor design: ink display type on khadi paper,
 *  with the product itself — the sponsored spinner line — running in a terminal.
 *  No fabricated totals: the hero shows how the product works, not invented numbers. */
export function Hero() {
  return (
    <section className="kbi-tw relative w-full overflow-hidden bg-[#F2F1EB] font-sans selection:bg-[#FFB300] selection:text-black">
      <div className={`pointer-events-none absolute inset-0 z-0 ${ui.gridBg}`} />

      <div className="relative z-20">
        <Navbar />
      </div>

      <main className="relative z-10 mx-auto grid w-full max-w-[1200px] items-center gap-12 px-6 pb-20 pt-14 md:px-10 md:pb-28 md:pt-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-start text-left">
          <span className={ui.eyebrow}>Ad marketplace for AI coding agents · 50% revenue share</span>

          <h1
            className="mt-6 text-[clamp(2.5rem,6vw,4.75rem)] font-extrabold leading-[1.02] tracking-tight text-[#15171E]"
            style={{ fontFamily: displayFont }}
          >
            Get paid while your AI{" "}
            <span className="underline decoration-[#FFB300] decoration-[6px] underline-offset-[6px]">thinks</span>.
          </h1>

          <p className="mt-6 max-w-xl text-base font-medium text-[#15171E]/65 md:text-lg">
            vibearning turns the “thinking…” spinner of Claude Code, Codex, and Gemini into one tasteful
            sponsored line — and pays India&apos;s developers for it, straight to UPI.
          </p>

          <div className="mt-8 flex w-full max-w-xl items-center gap-2 rounded-lg border border-[#DBD9CF] bg-white px-3 py-2">
            <code className="flex-1 truncate text-left font-mono text-xs text-[#15171E]/80 md:text-sm">{INSTALL_CMD}</code>
            <CopyButton
              text={INSTALL_CMD}
              className="shrink-0 rounded-md bg-[#15171E] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-black"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/earnings" className={ui.btnLime}>Start earning</Link>
            <Link href="/campaigns" className={ui.btnOutlineDark}>Advertise with us</Link>
          </div>
          <p className="mt-4 font-mono text-xs text-[#15171E]/50">
            free to install · uninstall in one click · paid in INR
          </p>
        </div>

        <TerminalDemo />
      </main>
    </section>
  );
}
