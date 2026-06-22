import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PaymentRouter } from "../payments/payment-router";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("auction escrow-gating (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;

  beforeAll(async () => {
    const fakeProvider = { name: "razorpay", collect: async () => ({ providerRef: "rzp", status: "paid" }), payout: async () => ({ providerRef: "x", status: "paid" }) };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    await redis.flushall();
    await prisma.blockPurchase.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.campaign.deleteMany();

    const reg = await request(app.getHttpServer()).post("/advertiser/register").send({ email: `auc_${Date.now()}@x.com`, password: "password1" });
    token = reg.body.token;

    // Funded campaign A (lower bid).
    const a = await request(app.getHttpServer()).post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "FUNDED-A", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 10000 });
    await request(app.getHttpServer()).post(`/advertiser/campaigns/${a.body.id}/blocks`).set("authorization", `Bearer ${token}`).send({ quantity: 3 });

    // Unfunded campaign B (HIGHER bid → ranks first, but no escrow).
    await request(app.getHttpServer()).post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "UNFUNDED-B", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 30000 });
  });
  afterAll(async () => { await app.close(); });

  it("skips the higher unfunded bid and serves the funded campaign", async () => {
    const res = await request(app.getHttpServer()).get("/serve?surface=codex-panel").expect(200);
    expect(res.body.ad.copy).toBe("FUNDED-A");
  });
});
