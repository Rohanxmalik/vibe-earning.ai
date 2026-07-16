import Link from "next/link";
import { Hero } from "@/components/ui/hero";
import { SectionHeading, ui, displayFont } from "@/components/ui/kit";
import { Ticker, type TickerItem } from "../components/Ticker";
import { SpinnerDemo } from "../components/SpinnerDemo";
import { BidMarket, type BidRow } from "../components/BidMarket";
import { Accordion, type FaqEntry } from "../components/Accordion";

// --- Fallback data ---------------------------------------------------------
// Shown only when the public stats endpoint is unreachable OR there's genuinely no live data yet
// (pre-launch / no advertisers). These are HONEST placeholders — never fabricated brands, prices,
// or earnings. Real values from /stats/public replace them the moment there's activity.

// The moving banner shows open ad slots, not brands that haven't paid.
const TICKER: TickerItem[] = [
  { name: "Place your ad here", copy: "reach developers at peak focus" },
  { name: "Your brand", copy: "one tasteful line while their AI thinks" },
  { name: "Place your ad here", copy: "pay only for verified, viewable impressions" },
  { name: "Sponsor the spinner", copy: "advertise@vibearning.in" },
  { name: "Your brand", copy: "India-first · priced in INR" },
  { name: "Place your ad here", copy: "second-price auction — you only pay what you must" },
];

// No advertisers have bid yet, so the live market starts empty (the section shows a "be first" CTA).
const MARKET: BidRow[] = [];

const FALLBACK_EARNED_PAISE = 0;
const FALLBACK_MARKET_PRICE_PAISE = 0;
const FALLBACK_IMPRESSIONS_PER_HOUR = 0;

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
  const hasLiveMarket = data.market.length > 0;
  return (
    <>
      <Hero />

      {/* Sponsor ticker — open ad slots until real advertisers are live */}
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
      <section id="how" className="scroll-mt-24 bg-[#F2F1EB] py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionHeading
            eyebrow="How it works"
            title="Install once. Keep coding. Cash out."
            sub="Nothing to click, refresh, or run on a schedule. You earn each time an ad is genuinely shown while your AI assistant is working."
          />
          <div className="kbi-tw mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-[#DBD9CF] bg-white p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#FFB300] font-mono text-lg font-semibold text-[#15171E]">{s.n}</div>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>{s.t}</h3>
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
            sub="vibearning swaps a single word in the “thinking…” line for a short sponsored one — that’s the only thing it changes."
          />
          <div className="kbi-tw mt-12 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#DBD9CF] bg-white p-8">
              <h3 className="text-xl font-bold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>What it changes</h3>
              <ul className="mt-5 space-y-3">
                {CHANGES.map((c) => (
                  <li key={c} className="flex gap-3 text-sm font-medium text-black/70">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#FFB300] text-xs font-bold text-[#15171E]">✓</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[#DBD9CF] bg-[#F2F1EB] p-8">
              <h3 className="text-xl font-bold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>What it never touches</h3>
              <ul className="mt-5 space-y-3">
                {NEVER.map((c) => (
                  <li key={c} className="flex gap-3 text-sm font-medium text-black/70">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-black/10 text-xs font-bold text-black/60">✕</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bid market — real auction when there's demand, honest "be first" state before */}
      <section className="bg-[#F2F1EB] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <SectionHeading
            eyebrow="Who's advertising"
            title={hasLiveMarket ? "The money's already moving." : "The auction opens with your bid."}
            sub={
              hasLiveMarket
                ? "A live second-price auction — advertisers bidding for spinner time right now. When your spinner shows one of their ads, you keep half."
                : "No advertisers are live yet — so this is honest: be the first brand in the spinner. Set a bid, fund a campaign, pay only for verified impressions."
            }
          />
          <div className="mt-10">
            {hasLiveMarket ? (
              <BidMarket rows={data.market} marketPricePaise={data.marketPricePaise} impressionsPerHour={data.impressionsPerHour} />
            ) : (
              <div className="kbi-tw rounded-2xl border border-[#DBD9CF] bg-white p-10 text-center">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#15171E]/50">
                  Live bids: 0 · be the first
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#15171E]" style={{ fontFamily: displayFont }}>
                  Your ad, in the spinner developers watch.
                </h3>
                <p className="mx-auto mt-3 max-w-lg text-sm font-medium text-black/60">
                  Priced in INR. Second-price auction, so you never pay more than you must. Creative is
                  moderated before it ever serves.
                </p>
                <div className="mt-6 flex justify-center">
                  <Link href="/campaigns" className={ui.btnBlue}>Advertise with us →</Link>
                </div>
              </div>
            )}
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
      <section className="kbi-tw relative overflow-hidden bg-[#15171E] text-white">
        <div className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center md:py-28">
          <p className="mb-5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FFB300]">
            ✳ thinking… pays
          </p>
          <h2
            className="text-3xl font-extrabold leading-[1.05] tracking-tight md:text-5xl"
            style={{ fontFamily: displayFont }}
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
