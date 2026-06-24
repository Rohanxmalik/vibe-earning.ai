import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { Notifier } from "../notifications/notifier";

describe("/auth recovery (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sent: { to: string; subject: string; body: string }[] = [];
  const advEmail = `rec_adv_${Date.now()}@x.com`;
  const devEmail = `rec_dev_${Date.now()}@x.com`;
  const tokenIn = (body: string) => body.match(/token=([^\s]+)/)?.[1] ?? "";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Notifier)
      .useValue({ send: async (to: string, subject: string, body: string) => { sent.push({ to, subject, body }); } })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.account.deleteMany({ where: { email: { in: [advEmail, devEmail] } } });
  });
  afterAll(async () => { await app.close(); });

  it("resets an advertiser password via the emailed link", async () => {
    await request(app.getHttpServer()).post("/advertiser/register").send({ email: advEmail, password: "password1" }).expect(201);

    await request(app.getHttpServer()).post("/auth/password-reset/request").send({ email: advEmail, type: "advertiser" }).expect(201);
    const token = tokenIn(sent.find((m) => m.to === advEmail)!.body);
    expect(token).toBeTruthy();

    await request(app.getHttpServer()).post("/auth/password-reset").send({ token, password: "newpassword2" }).expect(201);

    await request(app.getHttpServer()).post("/advertiser/login").send({ email: advEmail, password: "newpassword2" }).expect(201);
    await request(app.getHttpServer()).post("/advertiser/login").send({ email: advEmail, password: "password1" }).expect(401);
  });

  it("does not reveal unknown emails and rejects a bad reset token", async () => {
    await request(app.getHttpServer()).post("/auth/password-reset/request").send({ email: "ghost@x.com", type: "advertiser" }).expect(201);
    await request(app.getHttpServer()).post("/auth/password-reset").send({ token: "x".repeat(20), password: "whatever1" }).expect(400);
  });

  it("verifies a developer's email via the emailed link", async () => {
    const reg = await request(app.getHttpServer()).post("/dev/register").send({ email: devEmail, password: "password1" }).expect(201);
    const bearer = reg.body.token;

    await request(app.getHttpServer()).post("/auth/verify-email/request").set("authorization", `Bearer ${bearer}`).expect(201);
    const token = tokenIn(sent.find((m) => m.to === devEmail)!.body);
    await request(app.getHttpServer()).post("/auth/verify-email").send({ token }).expect(201);

    const acct = await prisma.account.findFirst({ where: { email: devEmail, type: "dev" } });
    expect(acct?.emailVerified).toBe(true);
  });
});
