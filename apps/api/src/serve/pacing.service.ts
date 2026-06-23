import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

/**
 * Per-campaign delivery pacing via a fixed per-minute counter in Redis. Smooths out
 * a campaign's spend instead of blowing the whole budget in seconds.
 */
@Injectable()
export class PacingService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if the campaign may serve one more impression this minute.
   * `pacePerMinute` null/<=0 means unlimited. Counts only when a cap is set.
   */
  async allow(campaignId: string, pacePerMinute: number | null | undefined, now = new Date()): Promise<boolean> {
    if (!pacePerMinute || pacePerMinute <= 0) return true;
    const minute = now.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
    const key = `pace:${campaignId}:${minute}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 120); // covers clock skew across the minute boundary
    return count <= pacePerMinute;
  }
}
