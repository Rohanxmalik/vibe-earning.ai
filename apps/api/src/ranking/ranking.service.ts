import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const key = (surface: string) => `rank:${surface}`;

@Injectable()
export class RankingService {
  constructor(private readonly redis: RedisService) {}

  async upsertBid(surface: string, campaignId: string, amount: number): Promise<void> {
    await this.redis.zadd(key(surface), amount, campaignId);
  }

  async topCampaign(surface: string): Promise<string | null> {
    const res = await this.redis.zrevrange(key(surface), 0, 0);
    return res.length ? res[0] : null;
  }
}
