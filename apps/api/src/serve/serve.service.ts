import { Injectable } from "@nestjs/common";
import type { ServeResponse } from "@kbi/shared";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PacingService } from "./pacing.service";

const MAX_CANDIDATES = 10;

@Injectable()
export class ServeService {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly pacing: PacingService,
  ) {}

  async pickAd(surface: string): Promise<ServeResponse | null> {
    return (await this.pickAds(surface, 1))[0] ?? null;
  }

  /** Top-N eligible ads in rank order (for rotating through the spinner's wait-state). */
  async pickAds(surface: string, n: number): Promise<ServeResponse[]> {
    if (n <= 0) return [];
    const ids = await this.ranking.topCampaigns(surface, MAX_CANDIDATES);
    const picked: ServeResponse[] = [];
    for (const id of ids) {
      if (picked.length >= n) break;
      const c = await this.prisma.campaign.findUnique({ where: { id } });
      if (!c || c.status !== "active") continue;
      if (!c.isHouseAd) {
        // Affordability: skip if escrow can't cover even one impression at the campaign's
        // own bid (its worst-case price; second-price only charges less). Avoids serving
        // an ad that would earn the developer nothing.
        const bid = await this.prisma.bid.findFirst({ where: { campaignId: id, surface, status: "active" }, orderBy: { amount: "desc" } });
        const price = Math.floor((bid?.amount ?? 0) / 1000);
        if (price <= 0) continue; // no / zero bid
        if ((await this.ledger.escrowBalance(id)) < price) continue; // out of budget
        if (!(await this.pacing.allow(id, c.pacePerMinute))) continue; // paced out this minute
      }
      picked.push({
        adId: c.id,
        campaignId: c.id,
        copy: c.copy,
        url: c.url,
        iconUrl: c.iconUrl,
        isHouseAd: c.isHouseAd,
      });
    }
    return picked;
  }
}
