import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { type CreateCampaign, deriveCopy, campaignSurfaces } from "@vibearning/shared";
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
      data: {
        advertiserId,
        // Derive the legacy single-line copy from the structured fields when the caller
        // didn't send one (the portal sends headline+tagline only).
        copy: dto.copy ?? deriveCopy(dto.headline, dto.tagline),
        headline: dto.headline ?? null,
        tagline: dto.tagline ?? null,
        brandColor: dto.brandColor ?? null,
        emoji: dto.emoji ?? null,
        url: dto.url,
        iconUrl: dto.iconUrl ?? null,
        isHouseAd: false,
        status: "pending",
        pacePerMinute: dto.pacePerMinute ?? null,
      },
    });
    // One active bid per target surface so the campaign serves on every selected spinner (Claude
    // Code, Codex, …). Ranked only after admin approval (rankBids ranks all of a campaign's bids).
    await this.prisma.bid.createMany({
      data: campaignSurfaces(dto).map((surface) => ({
        campaignId: campaign.id,
        surface,
        amount: dto.bidPerBlockPaise,
        status: "active",
      })),
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

  /**
   * Advertiser edits a campaign's creative and/or bid.
   * - Changing the bid re-ranks a live campaign at the new amount.
   * - Changing the creative (copy/url/icon) on a LIVE campaign sends it back to
   *   moderation (status "pending") and unranks it — admins approved the old copy,
   *   not the new one. Edits to a non-live campaign just update the fields.
   */
  async edit(
    advertiserId: string,
    campaignId: string,
    dto: {
      copy?: string;
      headline?: string | null;
      tagline?: string | null;
      brandColor?: string | null;
      emoji?: string | null;
      url?: string;
      iconUrl?: string | null;
      bidPerBlockPaise?: number;
    },
  ) {
    const c = await this.ownedCampaign(advertiserId, campaignId);

    if (dto.bidPerBlockPaise !== undefined) {
      await this.prisma.bid.updateMany({ where: { campaignId, status: "active" }, data: { amount: dto.bidPerBlockPaise } });
    }

    const creativeChanged =
      (dto.copy !== undefined && dto.copy !== c.copy) ||
      (dto.headline !== undefined && dto.headline !== c.headline) ||
      (dto.tagline !== undefined && dto.tagline !== c.tagline) ||
      (dto.brandColor !== undefined && dto.brandColor !== c.brandColor) ||
      (dto.emoji !== undefined && dto.emoji !== c.emoji) ||
      (dto.url !== undefined && dto.url !== c.url) ||
      (dto.iconUrl !== undefined && dto.iconUrl !== c.iconUrl);

    const data: {
      copy?: string;
      headline?: string | null;
      tagline?: string | null;
      brandColor?: string | null;
      emoji?: string | null;
      url?: string;
      iconUrl?: string | null;
      status?: string;
    } = {};
    if (dto.copy !== undefined) data.copy = dto.copy;
    if (dto.headline !== undefined) data.headline = dto.headline;
    if (dto.tagline !== undefined) data.tagline = dto.tagline;
    if (dto.brandColor !== undefined) data.brandColor = dto.brandColor;
    if (dto.emoji !== undefined) data.emoji = dto.emoji;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.iconUrl !== undefined) data.iconUrl = dto.iconUrl;

    // Keep the legacy `copy` in sync when the structured fields change but no explicit copy
    // was sent (the portal edits headline/tagline, not copy).
    if (dto.copy === undefined && (dto.headline !== undefined || dto.tagline !== undefined)) {
      data.copy = deriveCopy(dto.headline ?? c.headline, dto.tagline ?? c.tagline);
    }

    if (creativeChanged && c.status === "active") {
      data.status = "pending"; // re-moderation
      const bids = await this.prisma.bid.findMany({ where: { campaignId, status: "active" } });
      for (const b of bids) await this.ranking.removeBid(b.surface, campaignId);
    } else if (dto.bidPerBlockPaise !== undefined && c.status === "active") {
      await this.rankBids(campaignId); // re-rank at the new amount
    }

    return this.prisma.campaign.update({ where: { id: campaignId }, data });
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
