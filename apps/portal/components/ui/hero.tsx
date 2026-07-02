"use client";

import React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Navbar } from "./Navbar";
import { ui, displayFont, displayShadow } from "./kit";
import { LiveCounter } from "../LiveCounter";
import { CopyButton } from "../CopyButton";

const INSTALL_CMD = "code --install-extension vibearning.vsix";

// Inline SVG avatar — respects the strict `img-src 'self' data:` CSP.
const Avatar = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="23" r="12" fill="rgba(255,255,255,0.92)" />
    <path d="M11 60c0-12.5 9.4-21 21-21s21 8.5 21 21z" fill="rgba(255,255,255,0.92)" />
  </svg>
);

const ArrowGreenLeft = () => (
  <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible stroke-current text-[#CCFF00]" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10,90 C 10,40 40,20 60,50 C 70,65 80,75 95,70" />
    <path d="M80,55 L95,70 L85,85" />
  </svg>
);

const ArrowGreenRight = () => (
  <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible stroke-current text-[#CCFF00]" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M90,10 C 80,60 60,80 40,60 C 20,40 40,20 60,30 C 80,40 70,70 50,80" />
    <path d="M65,75 L50,80 L55,65" />
  </svg>
);

const CircularBadge = () => (
  <div className="relative flex h-28 w-28 rotate-12 cursor-pointer items-center justify-center rounded-full border-[3px] border-black/5 bg-[#CCFF00] shadow-xl transition-transform hover:scale-105 md:h-32 md:w-32">
    <div className="absolute inset-1 animate-[spin_10s_linear_infinite]">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <path id="badgePath" d="M 50, 50 m -36, 0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" fill="none" />
        <text className="text-[11px] font-black uppercase tracking-[0.18em]" fill="black">
          <textPath href="#badgePath" startOffset="0%">START EARNING FREE • START EARNING FREE •</textPath>
        </text>
      </svg>
    </div>
    <div className="absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-9 w-9 overflow-visible stroke-current text-black" fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20,80 Q 40,50 30,30 T 80,20" />
        <path d="M60,10 L80,20 L70,40" />
      </svg>
    </div>
  </div>
);

function FloatingCard({
  delay,
  rotate,
  tone,
  handle,
  amount,
}: {
  delay: number;
  rotate: string;
  tone: string;
  handle: string;
  amount: string;
}) {
  return (
    <motion.div
      animate={{ y: [0, -16, 0] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <div className={`flex w-44 flex-col items-center justify-center rounded-[2rem] border border-white/40 bg-white/20 p-5 shadow-2xl backdrop-blur-md ${rotate}`} style={{ aspectRatio: "3 / 3.5" }}>
        <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-[3px] border-white/50 shadow-inner" style={{ background: tone }}>
          <Avatar className="h-full w-full object-cover" />
        </div>
        <p className="text-center text-base font-bold text-white">{handle}</p>
        <p className="mt-1 text-center text-xs text-white/80">{amount}</p>
      </div>
    </motion.div>
  );
}

/** Default "earned by developers" total (paise) — used when no live value is provided. */
const DEFAULT_EARNED_PAISE = 742156000;

/** Full home hero in the blue/lime design, carrying all the previous landing content. */
export function Hero({ earnedPaise = DEFAULT_EARNED_PAISE }: { earnedPaise?: number } = {}) {
  return (
    <section className="kbi-tw relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0038FF] font-sans selection:bg-[#CCFF00] selection:text-black">
      <div className={`pointer-events-none absolute inset-0 z-0 ${ui.gridBg}`} />

      <div className="relative z-20">
        <Navbar />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col items-center justify-center px-4 pb-24 pt-6 md:pt-10">
        {/* Decorative floating cards / arrows / badge (desktop only) */}
        <div className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="pointer-events-auto absolute bottom-[12%] left-[3%] xl:left-[8%]">
            <FloatingCard delay={0} rotate="-rotate-12" tone="#D2B48C" handle="arjun.dev" amount="₹23,422 earned" />
          </div>
          <div className="pointer-events-auto absolute right-[3%] top-[14%] xl:right-[8%]">
            <FloatingCard delay={1} rotate="rotate-12" tone="#2C3E50" handle="meera.dev" amount="₹2,93,582 earned" />
          </div>
          <div className="absolute bottom-[6%] left-[1%] h-24 w-24 xl:left-[5%]">
            <ArrowGreenLeft />
          </div>
          <div className="absolute right-[1%] top-[8%] h-24 w-24 xl:right-[5%]">
            <ArrowGreenRight />
          </div>
          <div className="pointer-events-auto absolute bottom-[8%] right-[6%] xl:right-[12%]">
            <CircularBadge />
          </div>
        </div>

        {/* Center content column */}
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className={ui.eyebrow}>Ad marketplace for AI coding agents · 50% revenue share</span>

          <h1
            className="mt-6 max-w-full break-words text-[clamp(2.25rem,8vw,104px)] font-black uppercase leading-[0.9] tracking-tight text-white"
            style={{ fontFamily: displayFont, textShadow: displayShadow }}
          >
            <span className="block text-[#CCFF00]">Get paid</span>
            <span className="block">while your AI</span>
            <span className="block">thinks</span>
          </h1>

          <p className="mt-7 max-w-xl text-base font-medium text-white/85 md:text-lg">
            vibearning turns the “thinking…” spinner of Claude Code, Codex, and Gemini into one tasteful
            sponsored line — and pays India&apos;s developers for it, straight to UPI.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 py-2 text-sm font-bold text-white">
            <span className="text-[#CCFF00]">₹</span>
            <LiveCounter value={earnedPaise} format="inrFromPaise" />
            <span className="font-medium text-white/70">earned by developers</span>
          </div>

          <div className="mt-8 flex w-full max-w-xl items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 backdrop-blur">
            <code className="flex-1 truncate text-left font-mono text-xs text-white/90 md:text-sm">{INSTALL_CMD}</code>
            <CopyButton
              text={INSTALL_CMD}
              className="shrink-0 rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black transition-transform hover:scale-105"
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/earnings" className={ui.btnLime}>Start earning</Link>
            <Link href="/campaigns" className={ui.btnOutlineWhite}>Advertise with us</Link>
          </div>
          <p className="mt-4 text-xs font-medium text-white/70">Free to install · uninstall in one click · paid in INR</p>
        </div>
      </main>
    </section>
  );
}
