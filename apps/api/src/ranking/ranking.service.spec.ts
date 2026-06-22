import { Test } from "@nestjs/testing";
import { RankingService } from "./ranking.service";
import { RedisService } from "../redis/redis.service";

describe("RankingService", () => {
  let ranking: RankingService;
  let redis: RedisService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [RankingService, RedisService],
    }).compile();
    ranking = mod.get(RankingService);
    redis = mod.get(RedisService);
  });
  beforeEach(async () => { await redis.flushall(); });
  afterAll(async () => { await redis.quit(); });

  it("returns the highest bid first for a surface", async () => {
    await ranking.upsertBid("codex-panel", "campA", 100);
    await ranking.upsertBid("codex-panel", "campB", 500);
    expect(await ranking.topCampaign("codex-panel")).toBe("campB");
  });

  it("returns null when surface empty", async () => {
    expect(await ranking.topCampaign("codex-panel")).toBeNull();
  });
});
