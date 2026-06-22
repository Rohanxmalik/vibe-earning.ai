import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "./google-verifier";
import { PrismaService } from "../prisma/prisma.service";

describe("/auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier)
      .useValue({ verify: async () => ({ sub: "g-e2e", email: "e2e@x.com" }) })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.account.deleteMany({ where: { oauthSub: "g-e2e" } });
  });
  afterAll(async () => { await app.close(); });

  it("logs in with google and returns a token + account", async () => {
    const res = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) }).expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.account).toMatchObject({ email: "e2e@x.com", type: "dev" });
  });

  it("rejects /auth/me without a token", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  it("returns the account on /auth/me with the token", async () => {
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    const res = await request(app.getHttpServer())
      .get("/auth/me").set("authorization", `Bearer ${login.body.token}`).expect(200);
    expect(res.body).toMatchObject({ email: "e2e@x.com", type: "dev" });
  });

  it("attributes an /events impression to the signed-in account", async () => {
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    const accountId = login.body.account.id;
    await request(app.getHttpServer())
      .post("/events")
      .set("authorization", `Bearer ${login.body.token}`)
      .send({ installId: "auth_inst", campaignId: "auth_camp", surface: "codex-panel", type: "impression", nonce: "auth_nonce_1", visibleMs: 6000 })
      .expect(201);
    const row = await prisma.adEvent.findUnique({
      where: { installId_nonce: { installId: "auth_inst", nonce: "auth_nonce_1" } },
    });
    expect(row?.accountId).toBe(accountId);
  });
});
