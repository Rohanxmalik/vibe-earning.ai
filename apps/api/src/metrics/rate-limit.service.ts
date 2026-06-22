import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { minImpressionGapMs, hourlyCap, dailyCap } from "./constants";

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Atomically claim the per-install spacing slot. true = ok to count now. */
  async takeSpacingSlot(installId: string): Promise<boolean> {
    const res = await this.redis.set(`spacing:${installId}`, "1", "PX", minImpressionGapMs(), "NX");
    return res === "OK";
  }

  /** Increment hourly+daily counters; report whether still within caps. */
  async incrCaps(installId: string, now = new Date()): Promise<{ withinHourly: boolean; withinDaily: boolean }> {
    const hKey = `cap:h:${installId}:${now.toISOString().slice(0, 13)}`; // yyyy-mm-ddThh
    const dKey = `cap:d:${installId}:${now.toISOString().slice(0, 10)}`; // yyyy-mm-dd
    const hourly = await this.redis.incr(hKey);
    if (hourly === 1) await this.redis.expire(hKey, 3600);
    const daily = await this.redis.incr(dKey);
    if (daily === 1) await this.redis.expire(dKey, 86400);
    return { withinHourly: hourly <= hourlyCap(), withinDaily: daily <= dailyCap() };
  }
}
