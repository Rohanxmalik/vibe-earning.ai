import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";
import { RedisService } from "../redis/redis.service";

describe("/serve (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const ranking = app.get(RankingService);

    await redis.flushall();
    // Delete children before campaigns (FK): block purchases + bids reference Campaign.
    await prisma.blockPurchase.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.campaign.deleteMany();
    const house = await prisma.campaign.create({
      data: { copy: "Powered by Kickbacks-India", url: "https://kbi.example", isHouseAd: true },
    });
    await ranking.upsertBid("codex-panel", house.id, 0);
  });

  afterAll(async () => { await app.close(); });

  it("serves the house ad for a valid surface", async () => {
    const res = await request(app.getHttpServer()).get("/serve?surface=codex-panel").expect(200);
    expect(res.body.ad).toMatchObject({ copy: "Powered by Kickbacks-India", isHouseAd: true });
  });

  it("400s on an invalid surface", async () => {
    await request(app.getHttpServer()).get("/serve?surface=cursor").expect(400);
  });
});
