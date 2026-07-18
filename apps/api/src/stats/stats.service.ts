import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface LeaderboardRow {
  name: string;
  url: string;
  cpmPaise: number;
}

export interface TickerRow {
  name: string;
  copy: string;
}

export interface PublicStats {
  totalEarnedPaise: number;
  marketPricePaise: number;
  impressionsPerHour: number;
  leaderboard: LeaderboardRow[];
  ticker: TickerRow[];
}

/** One (privacy-masked) settled payout, for the public payout-proof feed. */
export interface PayoutProof {
  handle: string; // e.g. "arj•••@okaxis" or "dev #a1b2" — never a full identifier
  amountPaise: number;
  method: string; // upi | bank
  at: string; // ISO date (day precision)
}

/** Public transparency numbers: what's actually been earned and paid, plus proof of payouts. */
export interface TransparencyStats {
  totalPaidOutPaise: number; // sum of SETTLED payouts
  totalEarnedPaise: number; // credited developer earnings, lifetime
  developersPaid: number; // distinct devs who've received a settled payout
  currentRatePer1kPaise: number; // blended live market price per 1k impressions (0 if no bids)
  recentPayouts: PayoutProof[]; // most recent settled payouts, masked
  currency: "INR";
}

const LEADERBOARD_LIMIT = 12;
const TICKER_LIMIT = 10;
const ONE_HOUR_MS = 3_600_000;

/** Derive a short brand label from a campaign's copy (text before " · " or " — ", else first ~18 chars). */
function brandFromCopy(copy: string): string {
  const sep = copy.match(/\s[·—]\s/);
  if (sep && typeof sep.index === "number") return copy.slice(0, sep.index).trim();
  return copy.length > 18 ? copy.slice(0, 18).trim() : copy.trim();
}

/**
 * Read-only aggregates for the public marketing landing page. No auth, no PII — only
 * platform-wide totals and the live bid market. Empty/zero values when there's no data;
 * the frontend falls back to its own defaults.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicStats(now = new Date()): Promise<PublicStats> {
    const since = new Date(now.getTime() - ONE_HOUR_MS);
    const [credits, bids, impressionsPerHour] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { account: { startsWith: "earnings:dev:" }, direction: "credit" },
        select: { amount: true },
      }),
      this.prisma.bid.findMany({
        where: { status: "active", campaign: { status: "active" } },
        orderBy: { amount: "desc" },
        select: { amount: true, campaign: { select: { copy: true, url: true } } },
      }),
      this.prisma.adEvent.count({ where: { type: "impression", valid: true, createdAt: { gte: since } } }),
    ]);

    const totalEarnedPaise = credits.reduce((sum, e) => sum + e.amount, 0);

    const ranked = bids.slice(0, LEADERBOARD_LIMIT);
    const leaderboard: LeaderboardRow[] = ranked.map((b) => ({
      name: b.campaign.copy,
      url: b.campaign.url,
      cpmPaise: b.amount,
    }));

    const marketPricePaise = bids.length
      ? Math.round(bids.reduce((sum, b) => sum + b.amount, 0) / bids.length)
      : 0;

    const ticker: TickerRow[] = bids.slice(0, TICKER_LIMIT).map((b) => ({
      name: brandFromCopy(b.campaign.copy),
      copy: b.campaign.copy,
    }));

    return { totalEarnedPaise, marketPricePaise, impressionsPerHour, leaderboard, ticker };
  }

  /**
   * Public transparency figures. Everything here is REAL, aggregated data — no fabricated numbers.
   * At launch these are legitimately zero; the frontend renders an honest "no payouts yet" state.
   */
  async transparency(): Promise<TransparencyStats> {
    const [paidPayouts, credits, bids, recent] = await Promise.all([
      this.prisma.payout.findMany({ where: { status: "paid" }, select: { amountPaise: true, accountId: true } }),
      this.prisma.ledgerEntry.findMany({
        where: { account: { startsWith: "earnings:dev:" }, direction: "credit" },
        select: { amount: true },
      }),
      this.prisma.bid.findMany({
        where: { status: "active", campaign: { status: "active" } },
        select: { amount: true },
      }),
      this.prisma.payout.findMany({
        where: { status: "paid" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          amountPaise: true, provider: true, createdAt: true,
          account: { select: { email: true, id: true } },
        },
      }),
    ]);

    const totalPaidOutPaise = paidPayouts.reduce((s, p) => s + p.amountPaise, 0);
    const totalEarnedPaise = credits.reduce((s, c) => s + c.amount, 0);
    const developersPaid = new Set(paidPayouts.map((p) => p.accountId)).size;
    const currentRatePer1kPaise = bids.length
      ? Math.round(bids.reduce((s, b) => s + b.amount, 0) / bids.length)
      : 0;

    const recentPayouts: PayoutProof[] = recent.map((p) => ({
      handle: maskHandle(p.account?.email ?? null, p.account?.id ?? ""),
      amountPaise: p.amountPaise,
      method: p.provider === "razorpay" ? "upi" : "bank", // India payouts settle over UPI via RazorpayX
      at: p.createdAt.toISOString().slice(0, 10),
    }));

    return { totalPaidOutPaise, totalEarnedPaise, developersPaid, currentRatePer1kPaise, recentPayouts, currency: "INR" };
  }
}

/** Mask a developer identity for the public feed: never expose a full email or id. */
function maskHandle(email: string | null, id: string): string {
  if (email && email.includes("@")) {
    const [user, domain] = email.split("@");
    const head = user.slice(0, 3);
    return `${head}${"•".repeat(Math.max(1, Math.min(3, user.length - 3)))}@${domain}`;
  }
  return `dev #${id.slice(0, 4) || "0000"}`;
}
