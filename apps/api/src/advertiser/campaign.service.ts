import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
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
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
    await this.rankBids(campaignId);
    return { ok: true };
  }

  /** Advertiser pauses a live campaign — stops it serving by dropping it from the ranking. */
  async pause(advertiserId: string, campaignId: string) {
    const c = await this.ownedCampaign(advertiserId, campaignId);
    if (c.status !== "active") throw new BadRequestException("not_active");
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused" } });
    const bids = await this.prisma.bid.findMany({ where: { campaignId, status: "active" } });
    for (const b of bids) await this.ranking.removeBid(b.surface, campaignId);
    return { ok: true };
  }

  /** Advertiser resumes a paused campaign — re-ranks it so it serves again. */
  async resume(advertiserId: string, campaignId: string) {
    const c = await this.ownedCampaign(advertiserId, campaignId);
    if (c.status !== "paused") throw new BadRequestException("not_paused");
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "active" } });
    await this.rankBids(campaignId);
    return { ok: true };
  }

  private async ownedCampaign(advertiserId: string, campaignId: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c || c.advertiserId !== advertiserId) throw new ForbiddenException("not_your_campaign");
    return c;
  }

  private async rankBids(campaignId: string) {
    const bids = await this.prisma.bid.findMany({ where: { campaignId, status: "active" } });
    for (const b of bids) await this.ranking.upsertBid(b.surface, campaignId, b.amount);
  }
}
