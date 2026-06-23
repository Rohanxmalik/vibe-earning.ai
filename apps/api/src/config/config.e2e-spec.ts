import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
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

  it("blocks a suspended account from cashing out", async () => {
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    const accountId = login.body.account.id;
    await prisma.ledgerEntry.deleteMany({ where: { account: `earnings:dev:${accountId}` } });
    await prisma.ledgerEntry.create({ data: { eventId: `fraud_seed_${accountId}`, account: `earnings:dev:${accountId}`, direction: "credit", amount: 15000 } });

    await request(app.getHttpServer()).post(`/admin/accounts/${accountId}/suspend`).set("x-admin-key", ADMIN).send({ suspended: true }).expect(201);
    await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${login.body.token}`).expect(403);
  });
});
