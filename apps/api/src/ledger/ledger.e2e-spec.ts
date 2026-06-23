import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "../auth/google-verifier";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { LedgerService } from "./ledger.service";

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
    // Use an isolated surface so second-price pricing has no competing bids from other
    // specs — this campaign is the only bidder, so it pays its own 20000 (20 paise/impr).
    await prisma.bid.create({ data: { campaignId, surface: "claude-code-terminal", amount: 20000, status: "active" } });
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
      .send({ installId: "ledger_inst", campaignId, surface: "claude-code-terminal", type: "impression", nonce: "ledger_nonce_1", visibleMs: 6000 })
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

  it("never overspends escrow under concurrent impressions (atomic reservation)", async () => {
    const ledger = app.get(LedgerService);
    // Fresh campaign, isolated surface (no competing bids → pays own 20000 = 20 paise/impr).
    const c = await prisma.campaign.create({ data: { copy: "Concurrency ad", url: "https://x.dev", isHouseAd: false } });
    await prisma.bid.create({ data: { campaignId: c.id, surface: "claude-code-panel", amount: 20000, status: "active" } });
    // Fund escrow for EXACTLY 3 impressions (3 × 20 paise = 60).
    await prisma.ledgerEntry.create({ data: { eventId: `seed_concur_${c.id}`, account: `escrow:campaign:${c.id}`, direction: "credit", amount: 60 } });

    // Fire many valid impressions concurrently against a budget for 3.
    const events = Array.from({ length: 60 }, (_, i) => ({
      id: `concur_${c.id}_${i}`, campaignId: c.id, surface: "claude-code-panel", type: "impression", valid: true, accountId: null,
    }));
    await Promise.all(events.map((e) => ledger.postForEvent(e)));

    // Escrow must land at exactly 0 (3 paid), never negative.
    expect(await ledger.escrowBalance(c.id)).toBe(0);
    // Exactly 3 impressions were charged (one escrow debit each).
    const debits = await prisma.ledgerEntry.findMany({ where: { eventId: { in: events.map((e) => e.id) }, account: `escrow:campaign:${c.id}`, direction: "debit" } });
    expect(debits).toHaveLength(3);
  });
});
