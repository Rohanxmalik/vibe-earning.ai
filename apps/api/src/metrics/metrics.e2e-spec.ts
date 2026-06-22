import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("/events (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    await redis.flushall();
    await prisma.adEvent.deleteMany();
  });
  afterAll(async () => { await app.close(); });

  const ev = (over: Record<string, unknown> = {}) => ({
    installId: "e2e_inst", campaignId: "e2e_camp", surface: "codex-panel",
    type: "impression", nonce: "e2e_nonce_1", visibleMs: 6000, ...over,
  });

  it("accepts a valid impression", async () => {
    const res = await request(app.getHttpServer()).post("/events").send(ev()).expect(201);
    expect(res.body).toEqual({ deduped: false, valid: true, reason: null });
  });

  it("is idempotent on the same nonce", async () => {
    const res = await request(app.getHttpServer()).post("/events").send(ev()).expect(201);
    expect(res.body.deduped).toBe(true);
  });

  it("rejects a too-short view as invalid", async () => {
    const res = await request(app.getHttpServer())
      .post("/events").send(ev({ nonce: "e2e_nonce_2", visibleMs: 1000 })).expect(201);
    expect(res.body).toMatchObject({ valid: false, reason: "view_too_short" });
  });

  it("400s on a malformed event", async () => {
    await request(app.getHttpServer()).post("/events").send({ installId: "x" }).expect(400);
  });
});
