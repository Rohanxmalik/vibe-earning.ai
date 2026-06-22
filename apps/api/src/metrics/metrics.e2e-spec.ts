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

  it("flags ip_cluster once >5 distinct installs hit from the same IP", async () => {
    await redis.flushall(); // start the IP window clean (all requests share the loopback IP)
    const results: Array<{ valid: boolean; reason: string | null }> = [];
    for (let i = 1; i <= 6; i++) {
      const res = await request(app.getHttpServer())
        .post("/events")
        .send(ev({ installId: `cluster_inst_${i}`, nonce: `cluster_nonce_${i}`, campaignId: "cluster_camp" }))
        .expect(201);
      results.push(res.body);
    }
    expect(results[0]).toMatchObject({ valid: true }); // first installs are fine
    expect(results[5]).toMatchObject({ valid: false, reason: "ip_cluster" }); // 6th distinct install trips it
  });
});
