import { Injectable } from "@nestjs/common";
import type { ServeResponse } from "@kbi/shared";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const MAX_CANDIDATES = 10;

@Injectable()
export class ServeService {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async pickAd(surface: string): Promise<ServeResponse | null> {
    const ids = await this.ranking.topCampaigns(surface, MAX_CANDIDATES);
    for (const id of ids) {
      const c = await this.prisma.campaign.findUnique({ where: { id } });
      if (!c || c.status !== "active") continue;
      if (!c.isHouseAd && (await this.ledger.escrowBalance(id)) <= 0) continue; // out of budget
      return {
        adId: c.id,
        campaignId: c.id,
        copy: c.copy,
        url: c.url,
        iconUrl: c.iconUrl,
        isHouseAd: c.isHouseAd,
      };
    }
    return null;
  }
}
