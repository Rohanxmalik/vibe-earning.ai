import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as bcrypt from "bcryptjs";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "../auth/google-verifier";
import { PrismaService } from "../prisma/prisma.service";

const ADMIN = process.env.ADMIN_API_KEY ?? "dev-admin-key-change-me";

describe("config + fraud (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier).useValue({ verify: async () => ({ sub: "g-fraud", email: "fraud@x.com" }) })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await prisma.killswitch.deleteMany({ where: { scope: "global" } }); // reset
    await app.close();
  });

  it("toggles the global killswitch via /config", async () => {
    await request(app.getHttpServer()).post("/admin/killswitch").set("x-admin-key", ADMIN).send({ active: true }).expect(201);
    let res = await request(app.getHttpServer()).get("/config").expect(200);
    expect(res.body).toEqual({ active: true });

    await request(app.getHttpServer()).post("/admin/killswitch").set("x-admin-key", ADMIN).send({ active: false }).expect(201);
    res = await request(app.getHttpServer()).get("/config").expect(200);
    expect(res.body).toEqual({ active: false });
  });

  it("rejects the admin toggle without the key", async () => {
    await request(app.getHttpServer()).post("/admin/killswitch").send({ active: true }).expect(401);
  });

  it("admin can log in and use a Bearer token instead of the static key", async () => {
    const email = `admin_${Date.now()}@x.com`;
    await prisma.account.create({ data: { type: "admin", email, passwordHash: await bcrypt.hash("adminpass1", 8) } });
    const login = await request(app.getHttpServer()).post("/admin/login").send({ email, password: "adminpass1" }).expect(201);
    expect(login.body.token).toBeTruthy();
    // admin JWT authorises an admin endpoint
    await request(app.getHttpServer()).get("/admin/campaigns/pending").set("authorization", `Bearer ${login.body.token}`).expect(200);
    // wrong password is rejected
    await request(app.getHttpServer()).post("/admin/login").send({ email, password: "nope" }).expect(401);
  });

  it("rejects a non-admin (developer) Bearer token on admin endpoints", async () => {
    const dev = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    await request(app.getHttpServer()).get("/admin/campaigns/pending").set("authorization", `Bearer ${dev.body.token}`).expect(401);
  });

  it("lists pending campaigns for an admin and 401s without the key", async () => {
    const camp = await prisma.campaign.create({ data: { copy: "pending one", url: "https://x.dev", status: "pending" } });
    await request(app.getHttpServer()).get("/admin/campaigns/pending").expect(401);
    const res = await request(app.getHttpServer()).get("/admin/campaigns/pending").set("x-admin-key", ADMIN).expect(200);
    expect(res.body.some((c: { id: string }) => c.id === camp.id)).toBe(true);
    await prisma.campaign.delete({ where: { id: camp.id } });
  });

  it("lists pending payout destinations for an admin", async () => {
    const acct = await prisma.account.create({ data: { type: "dev" } });
    const dest = await prisma.payoutDestination.create({ data: { accountId: acct.id, method: "upi", vpa: "p@okaxis", status: "pending" } });
    const res = await request(app.getHttpServer()).get("/admin/payout-destinations/pending").set("x-admin-key", ADMIN).expect(200);
    expect(res.body.some((d: { id: string }) => d.id === dest.id)).toBe(true);
  });

  it("voids a fraud cluster: invalidates the events and reverses their earnings", async () => {
    const dev = await prisma.account.create({ data: { type: "dev" } });
    const ipHash = `bad_${Date.now()}`;
    // A valid impression that earned the dev 10 paise, with its ledger postings.
    const ev = await prisma.adEvent.create({ data: { installId: "fraud_i", campaignId: "fraud_c", surface: "codex-panel", type: "impression", nonce: `fr_${Date.now()}`, visibleMs: 6000, valid: true, ipHash, accountId: dev.id } });
    await prisma.ledgerEntry.createMany({ data: [
      { eventId: ev.id, account: "escrow:campaign:fraud_c", direction: "debit", amount: 20 },
      { eventId: ev.id, account: `earnings:dev:${dev.id}`, direction: "credit", amount: 10 },
      { eventId: ev.id, account: "revenue:platform", direction: "credit", amount: 10 },
    ] });

    await request(app.getHttpServer()).post("/admin/fraud/void-cluster").set("x-admin-key", ADMIN).send({ ipHash }).expect(201);

    const after = await prisma.adEvent.findUnique({ where: { id: ev.id } });
    expect(after?.valid).toBe(false);
    expect(after?.reason).toBe("voided");
    const earnings = await prisma.ledgerEntry.findMany({ where: { account: `earnings:dev:${dev.id}` } });
    const balance = earnings.reduce((s, e) => s + (e.direction === "credit" ? e.amount : -e.amount), 0);
    expect(balance).toBe(0); // 10 credited then 10 reversed
  });

  it("blocks a suspended account from cashing out", async () => {
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    const accountId = login.body.account.id;
    await prisma.ledgerEntry.deleteMany({ where: { account: `earnings:dev:${accountId}` } });
    await prisma.ledgerEntry.create({ data: { eventId: `fraud_seed_${accountId}`, account: `earnings:dev:${accountId}`, direction: "credit", amount: 15000 } });

    await request(app.getHttpServer()).post(`/admin/accounts/${accountId}/suspend`).set("x-admin-key", ADMIN).send({ suspended: true }).expect(201);
    await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${login.body.token}`).expect(403);
  });
});
