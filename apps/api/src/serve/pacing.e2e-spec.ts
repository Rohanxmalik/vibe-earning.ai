import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PaymentRouter } from "../payments/payment-router";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("serve pacing (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;
  const ADMIN = process.env.ADMIN_API_KEY ?? "dev-admin-key-change-me";
  const surface = "claude-code-panel"; // isolated from other serve specs

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

    const reg = await request(app.getHttpServer()).post("/advertiser/register").send({ email: `pace_${Date.now()}@x.com`, password: "password1" });
    token = reg.body.token;

    // Campaign capped at 1 impression/min, funded + approved.
    const c = await request(app.getHttpServer()).post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "PACED", url: "https://x.dev", surface, bidPerBlockPaise: 10000, pacePerMinute: 1 });
    await request(app.getHttpServer()).post(`/advertiser/campaigns/${c.body.id}/blocks`).set("authorization", `Bearer ${token}`).send({ quantity: 5 });
    await request(app.getHttpServer()).post(`/admin/campaigns/${c.body.id}/approve`).set("x-admin-key", ADMIN).expect(201);
  });
  afterAll(async () => { await app.close(); });

  it("serves the paced campaign once, then withholds it for the rest of the minute", async () => {
    const first = await request(app.getHttpServer()).get(`/serve?surface=${surface}`).expect(200);
    expect(first.body.ad?.copy).toBe("PACED");

    const second = await request(app.getHttpServer()).get(`/serve?surface=${surface}`).expect(200);
    expect(second.body.ad).toBeNull(); // paced out (no house ad on this surface)
  });
});
