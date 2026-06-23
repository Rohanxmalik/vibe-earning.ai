import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const key = (surface: string) => `rank:${surface}`;

@Injectable()
export class RankingService {
  constructor(private readonly redis: RedisService) {}

  async upsertBid(surface: string, campaignId: string, amount: number): Promise<void> {
    await this.redis.zadd(key(surface), amount, campaignId);
  }

  /** Remove a campaign from a surface's ranking (e.g. paused or stopped). */
  async removeBid(surface: string, campaignId: string): Promise<void> {
    await this.redis.zrem(key(surface), campaignId);
  }

  async topCampaign(surface: string): Promise<string | null> {
    const res = await this.redis.zrevrange(key(surface), 0, 0);
    return res.length ? res[0] : null;
  }

  async topCampaigns(surface: string, n: number): Promise<string[]> {
    if (n <= 0) return [];
    return this.redis.zrevrange(key(surface), 0, n - 1);
  }
}
