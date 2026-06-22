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
}
