import { Injectable } from "@nestjs/common";
import type { ServeResponse } from "@kbi/shared";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ServeService {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
  ) {}

  async pickAd(surface: string): Promise<ServeResponse | null> {
    const campaignId = await this.ranking.topCampaign(surface);
    if (!campaignId) return null;
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c || c.status !== "active") return null;
    return {
      adId: c.id,
      campaignId: c.id,
      copy: c.copy,
      url: c.url,
      iconUrl: c.iconUrl,
      isHouseAd: c.isHouseAd,
    };
  }
}
