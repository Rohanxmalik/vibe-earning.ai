import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

describe("/dev auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = "dev-e2e@x.com";

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.account.deleteMany({ where: { email, type: "dev" } });
  });
  afterAll(async () => { await app.close(); });

  it("registers a developer and issues a usable token", async () => {
    const res = await request(app.getHttpServer())
      .post("/dev/register").send({ email, password: "password1" }).expect(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.account).toMatchObject({ email, type: "dev" });

    const me = await request(app.getHttpServer())
      .get("/auth/me").set("authorization", `Bearer ${res.body.token}`).expect(200);
    expect(me.body).toMatchObject({ email, type: "dev" });
  });

  it("rejects duplicate registration", async () => {
    await request(app.getHttpServer()).post("/dev/register").send({ email, password: "password1" }).expect(400);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await request(app.getHttpServer()).post("/dev/login").send({ email, password: "password1" }).expect(201);
    await request(app.getHttpServer()).post("/dev/login").send({ email, password: "nope" }).expect(401);
  });

  it("validates input", async () => {
    await request(app.getHttpServer()).post("/dev/register").send({ email: "bad", password: "short" }).expect(400);
  });
});
