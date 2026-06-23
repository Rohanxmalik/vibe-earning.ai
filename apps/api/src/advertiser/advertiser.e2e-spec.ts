import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PaymentRouter } from "../payments/payment-router";
import { PrismaService } from "../prisma/prisma.service";

describe("/advertiser (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `adv_${Date.now()}@x.com`;
  let token: string;

  beforeAll(async () => {
    const fakeProvider = { name: "razorpay", collect: async () => ({ providerRef: "rzp_buy", status: "paid" }), payout: async () => ({ providerRef: "x", status: "paid" }) };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => { await app.close(); });

  it("registers, creates a campaign, buys blocks, funds escrow", async () => {
    const reg = await request(app.getHttpServer()).post("/advertiser/register").send({ email, password: "password1" }).expect(201);
    token = reg.body.token;
    expect(reg.body.account.type).toBe("advertiser");

    const camp = await request(app.getHttpServer())
      .post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "Buy our SaaS", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).expect(201);
    const campaignId = camp.body.id;

    const buy = await request(app.getHttpServer())
      .post(`/advertiser/campaigns/${campaignId}/blocks`).set("authorization", `Bearer ${token}`)
      .send({ quantity: 5 }).expect(201);
    expect(buy.body).toMatchObject({ quantity: 5, amountPaise: 100000, status: "paid" });

    const escrow = await prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaignId}`, direction: "credit" } });
    expect(escrow.reduce((s, e) => s + e.amount, 0)).toBe(100000);
  });

  it("requires auth to create a campaign", async () => {
    await request(app.getHttpServer()).post("/advertiser/campaigns").send({}).expect(401);
  });

  it("edits a campaign's copy and bid via PATCH", async () => {
    const camp = await request(app.getHttpServer())
      .post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "Editable copy", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).expect(201);
    const id = camp.body.id;

    const edited = await request(app.getHttpServer())
      .patch(`/advertiser/campaigns/${id}`).set("authorization", `Bearer ${token}`)
      .send({ copy: "Edited copy", bidPerBlockPaise: 25000 }).expect(200);
    expect(edited.body.copy).toBe("Edited copy");

    const bid = await prisma.bid.findFirst({ where: { campaignId: id, status: "active" } });
    expect(bid?.amount).toBe(25000);
  });

  it("rejects an empty PATCH and an unauthenticated PATCH", async () => {
    const camp = await request(app.getHttpServer())
      .post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "Another one", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).expect(201);
    await request(app.getHttpServer()).patch(`/advertiser/campaigns/${camp.body.id}`).set("authorization", `Bearer ${token}`).send({}).expect(400);
    await request(app.getHttpServer()).patch(`/advertiser/campaigns/${camp.body.id}`).send({ copy: "x y z" }).expect(401);
  });

  it("logs in an existing advertiser", async () => {
    await request(app.getHttpServer()).post("/advertiser/login").send({ email, password: "password1" }).expect(201);
    await request(app.getHttpServer()).post("/advertiser/login").send({ email, password: "nope" }).expect(401);
  });
});
