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
}
