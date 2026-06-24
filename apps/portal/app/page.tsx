import Link from "next/link";
import { Hero } from "@/components/ui/hero";
import { SectionHeading, ui, displayFont, displayShadowSm } from "@/components/ui/kit";
import { Ticker, type TickerItem } from "../components/Ticker";
import { SpinnerDemo } from "../components/SpinnerDemo";
import { BidMarket, type BidRow } from "../components/BidMarket";
import { Accordion, type FaqEntry } from "../components/Accordion";

// --- Fallback data ---------------------------------------------------------
// Used verbatim whenever the public stats endpoint is unreachable, errors, or
// returns empty/zero values, so the landing page is never broken or empty.

const TICKER: TickerItem[] = [
  { name: "Ramp", copy: "save time and money" },
  { name: "Sentry", copy: "quit buggin' — get Sentry" },
  { name: "Razorpay", copy: "payments built for India" },
  { name: "Zoho", copy: "the operating system for business" },
  { name: "Fluidstack", copy: "GPU compute, on tap" },
  { name: "Linear", copy: "issue tracking built for speed" },
  { name: "Postman", copy: "build APIs together" },
  { name: "Hasura", copy: "instant GraphQL on your data" },
];

const MARKET: BidRow[] = [
  { name: "Ramp · save time and money", url: "https://ramp.com", cpmPaise: 21000 },
  { name: "Razorpay · payments for India", url: "https://razorpay.com", cpmPaise: 20400 },
  { name: "Sentry · quit buggin'", url: "https://sentry.io", cpmPaise: 19600 },
  { name: "Linear · issue tracking, fast", url: "https://linear.app", cpmPaise: 18800 },
  { name: "Hasura · instant GraphQL", url: "https://hasura.io", cpmPaise: 17400 },
  { name: "Postman · build APIs together", url: "https://postman.com", cpmPaise: 16600 },
  { name: "Zoho · the OS for business", url: "https://zoho.com", cpmPaise: 16200 },
  { name: "Fluidstack · GPU compute", url: "https://fluidstack.io", cpmPaise: 15900 },
];

const FALLBACK_EARNED_PAISE = 742156000;
const FALLBACK_MARKET_PRICE_PAISE = 14800;
const FALLBACK_IMPRESSIONS_PER_HOUR = 118000;

/** Shape of the public, unauthenticated landing-page stats endpoint. */
interface PublicStats {
  totalEarnedPaise: number;
  marketPricePaise: number;
  impressionsPerHour: number;
  leaderboard: { name: string; url: string; cpmPaise: number }[];
  ticker: { name: string; copy: string }[];
}

/** Data actually rendered on the landing page (live values merged with fallbacks). */
interface LandingData {
  earnedPaise: number;
  marketPricePaise: number;
  impressionsPerHour: number;
  market: BidRow[];
  ticker: TickerItem[];
}

const FALLBACK_DATA: LandingData = {
  earnedPaise: FALLBACK_EARNED_PAISE,
  marketPricePaise: FALLBACK_MARKET_PRICE_PAISE,
  impressionsPerHour: FALLBACK_IMPRESSIONS_PER_HOUR,
  market: MARKET,
  ticker: TICKER,
};

const isPositive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Fetch live landing stats at request time, merging each field with its fallback.
 * Any failure (network, non-OK, malformed body) or empty/zero field falls back to
 * the hardcoded constants so the page always looks complete.
 */
async function getLandingData(): Promise<LandingData> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/stats/public`, { cache: "no-store" });
    if (!res.ok) return FALLBACK_DATA;
    const stats = (await res.json()) as Partial<PublicStats> | null;
    if (!stats) return FALLBACK_DATA;

    const ticker = Array.isArray(stats.ticker) && stats.ticker.length > 0 ? stats.ticker : TICKER;
    const market = Array.isArray(stats.leaderboard) && stats.leaderboard.length > 0 ? stats.leaderboard : MARKET;

    return {
      earnedPaise: isPositive(stats.totalEarnedPaise) ? stats.totalEarnedPaise : FALLBACK_EARNED_PAISE,
      marketPricePaise: isPositive(stats.marketPricePaise) ? stats.marketPricePaise : FALLBACK_MARKET_PRICE_PAISE,
      impressionsPerHour: isPositive(stats.impressionsPerHour) ? stats.impressionsPerHour : FALLBACK_IMPRESSIONS_PER_HOUR,
      market,
      ticker,
    };
  } catch {
    return FALLBACK_DATA;
  }
}

const FAQ: FaqEntry[] = [
  { group: "Earning", q: "How much will I actually make?", a: "It scales with how much your AI assistant is working — you earn per ad shown during real wait-states, plus any clicks. The current split is an estimated 50% of the net ad revenue from your impressions, paid in INR. It's not a guaranteed monthly figure." },
  { group: "Earning", q: "What do I have to do?", a: "Nothing extra. Install the extension, sign in, and keep coding. While your agent is thinking, one sponsored line replaces the spinner verb — verified, viewable impressions earn you a share." },
  { group: "Earning", q: "What counts as a real impression?", a: "The line must be genuinely on screen for at least five seconds during a live wait-state from real, human-initiated work — within per-user spacing rules and hourly/daily caps, and not excluded by our fraud systems." },
  { group: "Earning", q: "When and how do I get paid?", a: "Earnings accrue to your balance and pay out over UPI after a one-time KYC, once you're over the minimum payout. Built for India: paid in INR, no bank-wire or currency conversion." },
  { group: "Privacy & trust", q: "Does this read my code or prompts?", a: "No. We never read your code, prompts, files, or AI responses — the telemetry has no field that could carry them. For fraud detection we process your IP but store only a salted one-way hash, never the raw IP." },
  { group: "Privacy & trust", q: "Can I pause or uninstall it?", a: "Anytime, in one click. Disable it from the status bar to return the spinner to normal, or remove the extension entirely — every change it makes is reversible." },
  { group: "The ground rules", q: "What are the fraud ground rules?", a: "One account per person; real usage only (no bots, scripts, or click farms); no collusion or account networks; no tampering with telemetry; no circumventing caps. Crossing these makes activity non-billable and can block an account." },
  { group: "The ground rules", q: "What happens if an account is flagged?", a: "A blocked account stops earning immediately and credit from abusive activity is voided. Honest, established accounts are routed to a human before any action sticks — and you can appeal." },
];

const STEPS = [
  { n: "1", t: "Install & sign in", d: "Add the free extension (or use the Claude Code CLI) and sign in. About 30 seconds — no card, no setup." },
  { n: "2", t: "Your AI works, you earn", d: "While the agent is thinking, one sponsored line shows. Verified, viewable impressions earn you a 50% share." },
  { n: "3", t: "Cash out to UPI", d: "Link your UPI, pass a quick KYC, and withdraw your INR balance once you cross the minimum." },
];

const CHANGES = [
  "Just the “thinking…” verb — one short sponsored line, gone the moment the turn finishes.",
  "Plain text, capped at 60 characters. No images, video, sound, or tracking pixels.",
  "Always clearly sponsored and screened — never disguised as your agent’s output.",
  "Only during a genuine wait-state. Every other feature works exactly as before.",
];

const NEVER = [
  "Your code, prompts, and AI responses — never read.",
  "Your files and projects — nothing opened, scanned, or transmitted.",
  "Your setup — an existing custom status line is preserved, never overwritten.",
  "Anything permanently — every edit is reversible when you disable or uninstall.",
];

export default async function Home() {
  const data = await getLandingData();
  return (
    <>
      <Hero earnedPaise={data.earnedPaise} />

      {/* Sponsor ticker */}
      <Ticker items={data.ticker} />

      {/* See it in action */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading
            eyebrow="See it in action"
            title="One word changes. You start earning."
            sub="The “thinking…” verb becomes one tasteful sponsored line — and every verified second on screen pays you."
          />
          <div className="mx-auto mt-10 max-w-3xl">
            <SpinnerDemo />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 bg-[#F4F6FF] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="How it works"
            title="Install once. Keep coding. Cash out."
            sub="Nothing to click, refresh, or run on a schedule. You earn each time an ad is genuinely shown while your AI assistant is working."
          />
          <div className="kbi-tw mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#CCFF00] text-lg font-black text-black">{s.n}</div>
                <h3 className="mt-5 text-xl font-black uppercase tracking-tight text-black">{s.t}</h3>
                <p className="mt-2 text-sm font-medium text-black/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Transparency */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="Transparency"
            title="Only the spinner. Nothing else touched."
            sub="Kickbacks swaps a single word in the “thinking…” line for a short sponsored one — that’s the only thing it changes."
          />
          <div className="kbi-tw mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-[2rem] border border-black/5 bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
              <h3 className="text-xl font-black uppercase tracking-tight text-black">What it changes</h3>
              <ul className="mt-5 space-y-3">
                {CHANGES.map((c) => (
                  <li key={c} className="flex gap-3 text-sm font-medium text-black/70">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#CCFF00] text-xs font-black text-black">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[2rem] border border-black/5 bg-[#F4F6FF] p-8">
              <h3 className="text-xl font-black uppercase tracking-tight text-black">What it never touches</h3>
              <ul className="mt-5 space-y-3">
                {NEVER.map((c) => (
                  <li key={c} className="flex gap-3 text-sm font-medium text-black/70">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-black text-black/60">✕</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bid market */}
      <section className="bg-[#F4F6FF] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading
            eyebrow="Who's advertising"
            title="The money's already moving."
            sub="A live auction — advertisers bidding for spinner time right now. When your spinner shows one of their ads, you keep half."
          />
          <div className="mt-10">
            <BidMarket rows={data.market} marketPricePaise={data.marketPricePaise} impressionsPerHour={data.impressionsPerHour} />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-6">
          <SectionHeading
            eyebrow="FAQ"
            title="Questions?"
            sub={<>Earnings, privacy, and the ground rules that keep every payout real.</>}
          />
          <div className="mt-10">
            <Accordion items={FAQ} openFirst />
          </div>
          <p className="mt-8 text-center">
            <Link href="/faq" className={ui.btnOutlineDark}>Read the full FAQ →</Link>
          </p>
        </div>
      </section>

      {/* CTA band */}
      <section className="kbi-tw relative overflow-hidden bg-[#0038FF] text-white">
        <div className={`pointer-events-none absolute inset-0 ${ui.gridBg}`} />
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
          <h2
            className="text-3xl font-black uppercase leading-[0.95] tracking-tight md:text-5xl"
            style={{ fontFamily: displayFont, textShadow: displayShadowSm }}
          >
            You&apos;re already waiting. Get paid for it.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base font-medium text-white/85 md:text-lg">
            Free for developers. Two minutes to set up. Paid in INR to your UPI.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/earnings" className={ui.btnLime}>Create a developer account</Link>
          </div>
        </div>
      </section>
    </>
  );
}
