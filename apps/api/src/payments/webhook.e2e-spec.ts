import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { razorpaySignature } from "./webhook-verify";

const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "dev-razorpay-webhook-secret";

describe("/webhooks/razorpay (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let campaignId: string;
  const orderRef = `order_wh_${Date.now()}`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true }); // preserve raw body for HMAC
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.blockPurchase.deleteMany({ where: { providerRef: orderRef } });
    const camp = await prisma.campaign.create({ data: { copy: "wh", url: "https://x.dev" } });
    campaignId = camp.id;
    await prisma.ledgerEntry.deleteMany({ where: { account: `escrow:campaign:${campaignId}` } });
    // A collection that is still pending confirmation (real Razorpay order flow).
    await prisma.blockPurchase.create({
      data: { campaignId, quantity: 5, amountPaise: 100000, currency: "INR", status: "pending", providerRef: orderRef },
    });
  });
  afterAll(async () => { await app.close(); });

  const post = (raw: string, sig: string) =>
    request(app.getHttpServer())
      .post("/webhooks/razorpay")
      .set("content-type", "application/json")
      .set("x-razorpay-signature", sig)
      .send(raw);

  it("rejects an unsigned / wrongly-signed webhook", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: orderRef } } } });
    await post(raw, "deadbeef").expect(401);
  });

  it("flips the pending purchase to paid and funds escrow on a valid payment.captured", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: orderRef, id: "pay_1" } } } });
    await post(raw, razorpaySignature(raw, SECRET)).expect(200);

    const purchase = await prisma.blockPurchase.findFirst({ where: { providerRef: orderRef } });
    expect(purchase?.status).toBe("paid");
    const escrow = await prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaignId}`, direction: "credit" } });
    expect(escrow.reduce((s, e) => s + e.amount, 0)).toBe(100000);
  });

  it("is idempotent on a duplicate delivery (escrow not double-funded)", async () => {
    const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { order_id: orderRef, id: "pay_1" } } } });
    await post(raw, razorpaySignature(raw, SECRET)).expect(200);
    const escrow = await prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaignId}`, direction: "credit" } });
    expect(escrow.reduce((s, e) => s + e.amount, 0)).toBe(100000); // unchanged
  });

  it("settles a pending payout on payout.processed and debits earnings", async () => {
    const acct = await prisma.account.create({ data: { type: "dev" } });
    const payRef = `pout_wh_${Date.now()}`;
    await prisma.ledgerEntry.create({ data: { eventId: `wh_seed_${acct.id}`, account: `earnings:dev:${acct.id}`, direction: "credit", amount: 20000 } });
    const payout = await prisma.payout.create({ data: { accountId: acct.id, provider: "razorpay", amountPaise: 20000, currency: "INR", status: "pending", providerRef: payRef } });

    const raw = JSON.stringify({ event: "payout.processed", payload: { payout: { entity: { id: payRef } } } });
    await post(raw, razorpaySignature(raw, SECRET)).expect(200);

    const updated = await prisma.payout.findUnique({ where: { id: payout.id } });
    expect(updated?.status).toBe("paid");
    const entries = await prisma.ledgerEntry.findMany({ where: { account: `earnings:dev:${acct.id}` } });
    const balance = entries.reduce((s, e) => s + (e.direction === "credit" ? e.amount : -e.amount), 0);
    expect(balance).toBe(0); // earnings debited by recordPayout
  });
});
