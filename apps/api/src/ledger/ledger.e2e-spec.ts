import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "../auth/google-verifier";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("/ledger (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;
  let accountId: string;
  let campaignId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier)
      .useValue({ verify: async () => ({ sub: "g-ledger", email: "ledger@x.com" }) })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    // Clear the shared IP-cluster set: every e2e request comes from the loopback IP,
    // so installs counted by other event-posting specs would otherwise trip the
    // ip_cluster fraud flag here and the impression wouldn't post any ledger entries.
    await redis.flushall();
    await prisma.account.deleteMany({ where: { oauthSub: "g-ledger" } });
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    token = login.body.token;
    accountId = login.body.account.id;

    const campaign = await prisma.campaign.create({ data: { copy: "Ledger ad", url: "https://x.dev", isHouseAd: false } });
    campaignId = campaign.id;
    await prisma.bid.create({ data: { campaignId, surface: "codex-panel", amount: 20000, status: "active" } });
    // Fund escrow so the impression actually posts (serving now enforces a no-overspend guard).
    await prisma.ledgerEntry.deleteMany({ where: { account: `escrow:campaign:${campaignId}` } });
    await prisma.ledgerEntry.create({ data: { eventId: `escrow_seed_${campaignId}`, account: `escrow:campaign:${campaignId}`, direction: "credit", amount: 100000 } });
    // Clear prior-run state so the impression isn't deduped and posts fresh to this run's account.
    await prisma.adEvent.deleteMany({ where: { installId: "ledger_inst" } });
    await prisma.ledgerEntry.deleteMany({ where: { account: `earnings:dev:${accountId}` } });
  });
  afterAll(async () => { await app.close(); });

  it("posts ledger entries for a paid valid impression and exposes the balance", async () => {
    await request(app.getHttpServer())
      .post("/events")
      .set("authorization", `Bearer ${token}`)
      .send({ installId: "ledger_inst", campaignId, surface: "codex-panel", type: "impression", nonce: "ledger_nonce_1", visibleMs: 6000 })
      .expect(201);

    const event = await prisma.adEvent.findUnique({ where: { installId_nonce: { installId: "ledger_inst", nonce: "ledger_nonce_1" } } });
    const entries = await prisma.ledgerEntry.findMany({ where: { eventId: event!.id } });
    expect(entries).toHaveLength(3);
    const debit = entries.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amount, 0);
    const credit = entries.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amount, 0);
    expect(debit).toBe(20);
    expect(credit).toBe(20);

    const res = await request(app.getHttpServer()).get("/ledger/me/balance").set("authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ balancePaise: 10, currency: "INR" });
  });

  it("requires auth for the balance endpoint", async () => {
    await request(app.getHttpServer()).get("/ledger/me/balance").expect(401);
  });
});
