import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

describe("/me DSAR (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `me_${Date.now()}@x.com`;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.account.deleteMany({ where: { email, type: "dev" } });
  });
  afterAll(async () => { await app.close(); });

  it("requires auth", async () => {
    await request(app.getHttpServer()).get("/me/export").expect(401);
  });

  it("exports the signed-in account's data, then erases it on delete", async () => {
    const reg = await request(app.getHttpServer()).post("/dev/register").send({ email, password: "password1" }).expect(201);
    const bearer = reg.body.token;

    const exp = await request(app.getHttpServer()).get("/me/export").set("authorization", `Bearer ${bearer}`).expect(200);
    expect(exp.body.account).toMatchObject({ email, type: "dev" });
    expect(Array.isArray(exp.body.payouts)).toBe(true);

    await request(app.getHttpServer()).delete("/me").set("authorization", `Bearer ${bearer}`).expect(200);

    const acct = await prisma.account.findFirst({ where: { id: reg.body.account.id } });
    expect(acct?.email).toBeNull();
    expect(acct?.passwordHash).toBeNull();
    expect(acct?.suspended).toBe(true);
    // can no longer log in
    await request(app.getHttpServer()).post("/dev/login").send({ email, password: "password1" }).expect(401);
  });
});
