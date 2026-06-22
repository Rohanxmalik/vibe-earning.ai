import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "../auth/google-verifier";
import { PaymentRouter } from "./payment-router";
import { PrismaService } from "../prisma/prisma.service";

describe("/payouts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let accountId: string;

  beforeAll(async () => {
    const fakeProvider = {
      name: "razorpay",
      payout: async () => ({ providerRef: "rzp_e2e", status: "paid" }),
      collect: async () => ({ providerRef: "x", status: "paid" }),
    };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier).useValue({ verify: async () => ({ sub: "g-pay", email: "pay@x.com" }) })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    token = login.body.token;
    accountId = login.body.account.id;

    // Reset prior-run state and seed an earnings balance of 15000 paise.
    await prisma.payout.deleteMany({ where: { accountId } });
    await prisma.ledgerEntry.deleteMany({ where: { account: { in: [`earnings:dev:${accountId}`, `payouts:cleared:${accountId}`] } } });
    await prisma.ledgerEntry.create({ data: { eventId: `seed_${accountId}`, account: `earnings:dev:${accountId}`, direction: "credit", amount: 15000 } });
  });
  afterAll(async () => { await app.close(); });

  it("pays out the balance and zeroes earnings", async () => {
    const res = await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${token}`).expect(201);
    expect(res.body).toMatchObject({ amountPaise: 15000, status: "paid", provider: "razorpay" });

    const bal = await request(app.getHttpServer()).get("/ledger/me/balance").set("authorization", `Bearer ${token}`).expect(200);
    expect(bal.body.balancePaise).toBe(0);
  });

  it("rejects a second payout when the balance is now below threshold", async () => {
    await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${token}`).expect(400);
  });

  it("requires auth", async () => {
    await request(app.getHttpServer()).post("/payouts").expect(401);
  });
});
