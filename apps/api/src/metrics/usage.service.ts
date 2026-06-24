import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { hourlyCap, dailyCap } from "./constants";

/**
 * Surfaces a developer's current earning-limit usage. Caps are enforced per *install*
 * (see RateLimitService), so we read the counters for the account's most recently
 * active install — the device they're earning on right now.
 */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async currentUsage(accountId: string, now = new Date()) {
    const last = await this.prisma.adEvent.findFirst({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      select: { installId: true },
    });

    let hourlyCount = 0;
    let dailyCount = 0;
    if (last?.installId) {
      const hKey = `cap:h:${last.installId}:${now.toISOString().slice(0, 13)}`;
      const dKey = `cap:d:${last.installId}:${now.toISOString().slice(0, 10)}`;
      const [h, d] = await Promise.all([this.redis.get(hKey), this.redis.get(dKey)]);
      hourlyCount = Number(h ?? 0);
      dailyCount = Number(d ?? 0);
    }

    const hourReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1)).toISOString();
    const dayReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

    return {
      hourly: { count: hourlyCount, cap: hourlyCap(), resetAt: hourReset },
      daily: { count: dailyCount, cap: dailyCap(), resetAt: dayReset },
    };
  }
}
