import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

@Injectable()
export class CampaignStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async forCampaign(campaignId: string) {
    const [impressions, clicks, escrowRemainingPaise, debits] = await Promise.all([
      this.prisma.adEvent.count({ where: { campaignId, type: "impression", valid: true } }),
      this.prisma.adEvent.count({ where: { campaignId, type: "click", valid: true } }),
      this.ledger.escrowBalance(campaignId),
      this.prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaignId}`, direction: "debit" } }),
    ]);
    const spendPaise = debits.reduce((sum, e) => sum + e.amount, 0);
    return { impressions, clicks, spendPaise, escrowRemainingPaise };
  }

  /** Escrow spend grouped by calendar day (UTC), oldest first — for a spend-over-time view. */
  async dailySpend(campaignId: string): Promise<Array<{ date: string; spendPaise: number }>> {
    const debits = await this.prisma.ledgerEntry.findMany({
      where: { account: `escrow:campaign:${campaignId}`, direction: "debit" },
    });
    const byDay = new Map<string, number>();
    for (const e of debits) {
      const day = new Date(e.createdAt).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + e.amount);
    }
    return [...byDay.entries()]
      .map(([date, spendPaise]) => ({ date, spendPaise }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
