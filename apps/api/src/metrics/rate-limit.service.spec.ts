import { Test } from "@nestjs/testing";
import { RateLimitService } from "./rate-limit.service";
import { RedisService } from "../redis/redis.service";

describe("RateLimitService", () => {
  let svc: RateLimitService;
  let redis: RedisService;

  beforeAll(async () => {
    process.env.METRICS_HOURLY_CAP = "2";
    process.env.METRICS_DAILY_CAP = "3";
    const mod = await Test.createTestingModule({
      providers: [RateLimitService, RedisService],
    }).compile();
    svc = mod.get(RateLimitService);
    redis = mod.get(RedisService);
  });
  beforeEach(async () => { await redis.flushall(); });
  afterAll(async () => { await redis.quit(); });

  it("grants a spacing slot once, then refuses within the window", async () => {
    expect(await svc.takeSpacingSlot("inst")).toBe(true);
    expect(await svc.takeSpacingSlot("inst")).toBe(false);
  });

  it("enforces the hourly cap", async () => {
    expect((await svc.incrCaps("inst")).withinHourly).toBe(true);  // 1 <= 2
    expect((await svc.incrCaps("inst")).withinHourly).toBe(true);  // 2 <= 2
    expect((await svc.incrCaps("inst")).withinHourly).toBe(false); // 3 > 2
  });
});
