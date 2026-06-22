import { Injectable } from "@nestjs/common";
import type { CreateCampaign } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  async create(advertiserId: string, dto: CreateCampaign) {
    const campaign = await this.prisma.campaign.create({
      data: { advertiserId, copy: dto.copy, url: dto.url, iconUrl: dto.iconUrl ?? null, isHouseAd: false },
    });
    await this.prisma.bid.create({
      data: { campaignId: campaign.id, surface: dto.surface, amount: dto.bidPerBlockPaise, status: "active" },
    });
    await this.ranking.upsertBid(dto.surface, campaign.id, dto.bidPerBlockPaise);
    return campaign;
  }
}
