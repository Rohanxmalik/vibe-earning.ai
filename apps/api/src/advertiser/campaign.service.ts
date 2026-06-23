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
    // New advertiser campaigns land in moderation. They are NOT ranked (and so
    // never serve) until an admin approves them. House ads bypass this.
    const campaign = await this.prisma.campaign.create({
      data: { advertiserId, copy: dto.copy, url: dto.url, iconUrl: dto.iconUrl ?? null, isHouseAd: false, status: "pending", pacePerMinute: dto.pacePerMinute ?? null },
    });
    await this.prisma.bid.create({
      data: { campaignId: campaign.id, surface: dto.surface, amount: dto.bidPerBlockPaise, status: "active" },
    });
    return campaign;
  }

  // Admin moderation: flip a pending campaign live and rank its bids so it serves.
  async approve(campaignId: string) {
    const bids = await this.prisma.bid.findMany({ where: { campaignId, status: "active" } });
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
    for (const b of bids) {
      await this.ranking.upsertBid(b.surface, campaignId, b.amount);
    }
    return { ok: true };
  }
}
