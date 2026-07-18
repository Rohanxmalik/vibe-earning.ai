# Plan 02 — Metrics + View Validation (`/events`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an idempotent `POST /events` endpoint that records ad impressions/clicks, enforcing the 5-second view threshold, per-install spacing, and hourly/daily caps — producing the validated `AdEvent` rows the ledger (Plan 05) will later consume.

**Architecture:** Builds on Plan 01 (NestJS api, global `PrismaModule`/`RedisModule`). New `MetricsModule` with a thin `RateLimitService` (Redis spacing + cap counters) and a `MetricsService` (dedupe → validate → persist). Events are deduped by a `(installId, nonce)` unique constraint so the extension's offline-retry queue never double-counts.

**Tech Stack:** Same as Plan 01 — TypeScript, NestJS, Prisma+Postgres, ioredis+Redis, zod, Jest (api), vitest (`packages/shared`).

> **Prerequisites:** Plan 01 merged to `main`; `docker compose up -d` running; `packages/shared` built (`pnpm --filter @vibearning/shared build`).

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §8, §10.

---

## File Structure

```
packages/shared/
  src/events.ts                 # EventType enum + ingest/result zod schemas (NEW)
  src/events.test.ts            # (NEW)
  src/index.ts                  # add: export * from "./events"  (MODIFY)

apps/api/
  prisma/schema.prisma          # add AdEvent model (MODIFY)
  src/metrics/constants.ts      # tunable thresholds (env-overridable) (NEW)
  src/metrics/rate-limit.service.ts        # Redis spacing + caps (NEW)
  src/metrics/rate-limit.service.spec.ts   # (NEW, real Redis)
  src/metrics/metrics.service.ts           # dedupe → validate → persist (NEW)
  src/metrics/metrics.service.spec.ts      # (NEW, mocks)
  src/metrics/metrics.controller.ts        # POST /events (NEW)
  src/metrics/metrics.module.ts            # (NEW)
  src/metrics/metrics.e2e-spec.ts          # (NEW, real PG+Redis)
  src/app.module.ts             # import MetricsModule (MODIFY)
```

`campaignId` is stored as a plain string (no FK) — events reference campaigns the extension received from `/serve`; referential integrity is enforced later at ledger consumption, keeping this endpoint robust (no `P2003` 500s on races/cleanup).

---

## Task 1: Shared — event enum + DTOs (TDD, vitest)

**Files:**
- Create: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/events.test.ts`

- [ ] **Step 1: Write the failing test — `src/events.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { eventIngestSchema } from "./events";

const base = {
  installId: "inst_1", campaignId: "camp_1", surface: "codex-panel",
  type: "impression", nonce: "abcd1234", visibleMs: 6000,
};

describe("eventIngestSchema", () => {
  it("accepts a valid impression event", () => {
    expect(eventIngestSchema.safeParse(base).success).toBe(true);
  });
  it("rejects an unknown event type", () => {
    expect(eventIngestSchema.safeParse({ ...base, type: "scroll" }).success).toBe(false);
  });
  it("rejects a too-short nonce", () => {
    expect(eventIngestSchema.safeParse({ ...base, nonce: "x" }).success).toBe(false);
  });
  it("defaults visibleMs to 0 when omitted", () => {
    const { visibleMs, ...noVis } = base;
    const parsed = eventIngestSchema.parse(noVis);
    expect(parsed.visibleMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibearning/shared test`
Expected: FAIL — cannot find `./events`.

- [ ] **Step 3: Implement `src/events.ts`**

```ts
import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const EVENT_TYPES = ["impression", "click"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const eventTypeSchema = z.enum(EVENT_TYPES);

export const eventIngestSchema = z.object({
  installId: z.string().min(1),
  campaignId: z.string().min(1),
  surface: surfaceSchema,
  type: eventTypeSchema,
  nonce: z.string().min(8),
  visibleMs: z.number().int().min(0).default(0),
});
export type EventIngest = z.infer<typeof eventIngestSchema>;

export const eventResultSchema = z.object({
  deduped: z.boolean(),
  valid: z.boolean(),
  reason: z.string().nullable(),
});
export type EventResult = z.infer<typeof eventResultSchema>;
```

- [ ] **Step 4: Modify `src/index.ts`** — add the re-export

```ts
export * from "./surfaces";
export * from "./dtos";
export * from "./events";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vibearning/shared test`
Expected: PASS (existing + 4 new).

- [ ] **Step 6: Rebuild shared (api's jest resolves `@vibearning/shared` from `dist`)**

Run: `pnpm --filter @vibearning/shared build`
Expected: `dist/` updated.

- [ ] **Step 7: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add ad-event enum and ingest/result DTOs"
```

---

## Task 2: Prisma — `AdEvent` model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Append the `AdEvent` model to `prisma/schema.prisma`**

```prisma
model AdEvent {
  id         String   @id @default(cuid())
  installId  String
  campaignId String
  surface    String
  type       String   // impression | click
  nonce      String
  visibleMs  Int      @default(0)
  valid      Boolean
  reason     String?  // view_too_short | spacing | hourly_cap | daily_cap ; null when valid
  createdAt  DateTime @default(now())

  @@unique([installId, nonce])
  @@index([campaignId, type, valid])
}
```

- [ ] **Step 2: Apply schema + record migration**

> Per Plan 01's gotcha, `migrate dev` can hang on an advisory lock in non-interactive shells. Use `db push` then record it.

Run:
```bash
pnpm --filter @vibearning/api exec prisma db push
pnpm --filter @vibearning/api exec prisma generate
```
Expected: `AdEvent` table created in Postgres; client regenerated with `prisma.adEvent`.

- [ ] **Step 3: Verify table exists**

Run: `docker compose exec -T postgres psql -U kbi -d kbi -c "\d \"AdEvent\""`
Expected: table description lists the columns + the `installId, nonce` unique index.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add AdEvent model (idempotent on installId+nonce)"
```

---

## Task 3: Rate-limit service — spacing + caps (TDD, real Redis)

**Files:**
- Create: `src/metrics/constants.ts`, `src/metrics/rate-limit.service.ts`
- Test: `src/metrics/rate-limit.service.spec.ts`

- [ ] **Step 1: Implement `src/metrics/constants.ts`** (env-overridable so values stay tunable + testable)

```ts
// All thresholds are env-overridable. Defaults are placeholders — tune later (spec §8/§10).
export const minViewMs = () => Number(process.env.METRICS_MIN_VIEW_MS ?? 5000);
export const minImpressionGapMs = () => Number(process.env.METRICS_MIN_GAP_MS ?? 5000);
export const hourlyCap = () => Number(process.env.METRICS_HOURLY_CAP ?? 120);
export const dailyCap = () => Number(process.env.METRICS_DAILY_CAP ?? 600);
```

- [ ] **Step 2: Write the failing test — `src/metrics/rate-limit.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { RateLimitService } from "./rate-limit.service";
import { RedisService } from "../redis/redis.service";

describe("RateLimitService", () => {
  let svc: RateLimitService;
  let redis: RedisService;

  beforeAll(async () => {
    process.env.METRICS_HOURLY_CAP = "2";
    process.env.METRICS_DAILY_CAP = "3";
    const mod = await Test.createTestingModule({
      providers: [RateLimitService, RedisService],
    }).compile();
    svc = mod.get(RateLimitService);
    redis = mod.get(RedisService);
  });
  beforeEach(async () => { await redis.flushall(); });
  afterAll(async () => { await redis.quit(); });

  it("grants a spacing slot once, then refuses within the window", async () => {
    expect(await svc.takeSpacingSlot("inst")).toBe(true);
    expect(await svc.takeSpacingSlot("inst")).toBe(false);
  });

  it("enforces the hourly cap", async () => {
    expect((await svc.incrCaps("inst")).withinHourly).toBe(true);  // 1 <= 2
    expect((await svc.incrCaps("inst")).withinHourly).toBe(true);  // 2 <= 2
    expect((await svc.incrCaps("inst")).withinHourly).toBe(false); // 3 > 2
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @vibearning/api test -- rate-limit`
Expected: FAIL — cannot find `./rate-limit.service`.

- [ ] **Step 4: Implement `src/metrics/rate-limit.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { minImpressionGapMs, hourlyCap, dailyCap } from "./constants";

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Atomically claim the per-install spacing slot. true = ok to count now. */
  async takeSpacingSlot(installId: string): Promise<boolean> {
    const res = await this.redis.set(`spacing:${installId}`, "1", "PX", minImpressionGapMs(), "NX");
    return res === "OK";
  }

  /** Increment hourly+daily counters; report whether still within caps. */
  async incrCaps(installId: string, now = new Date()): Promise<{ withinHourly: boolean; withinDaily: boolean }> {
    const hKey = `cap:h:${installId}:${now.toISOString().slice(0, 13)}`; // yyyy-mm-ddThh
    const dKey = `cap:d:${installId}:${now.toISOString().slice(0, 10)}`; // yyyy-mm-dd
    const hourly = await this.redis.incr(hKey);
    if (hourly === 1) await this.redis.expire(hKey, 3600);
    const daily = await this.redis.incr(dKey);
    if (daily === 1) await this.redis.expire(dKey, 86400);
    return { withinHourly: hourly <= hourlyCap(), withinDaily: daily <= dailyCap() };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vibearning/api test -- rate-limit`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/metrics/constants.ts apps/api/src/metrics/rate-limit.service.ts apps/api/src/metrics/rate-limit.service.spec.ts
git commit -m "feat(api): rate-limit service (per-install spacing + hourly/daily caps)"
```

---

## Task 4: Metrics service — dedupe → validate → persist (TDD, mocks)

**Files:**
- Create: `src/metrics/metrics.service.ts`
- Test: `src/metrics/metrics.service.spec.ts`

- [ ] **Step 1: Write the failing test — `src/metrics/metrics.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { MetricsService } from "./metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimitService } from "./rate-limit.service";

const prismaMock = { adEvent: { findUnique: jest.fn(), create: jest.fn() } };
const rateMock = { takeSpacingSlot: jest.fn(), incrCaps: jest.fn() };

const impression = {
  installId: "i1", campaignId: "c1", surface: "codex-panel" as const,
  type: "impression" as const, nonce: "nonce_aaaa", visibleMs: 6000,
};

describe("MetricsService", () => {
  let svc: MetricsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    rateMock.takeSpacingSlot.mockResolvedValue(true);
    rateMock.incrCaps.mockResolvedValue({ withinHourly: true, withinDaily: true });
    prismaMock.adEvent.findUnique.mockResolvedValue(null);
    prismaMock.adEvent.create.mockResolvedValue({});
    const mod = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RateLimitService, useValue: rateMock },
      ],
    }).compile();
    svc = mod.get(MetricsService);
  });

  it("records a valid impression", async () => {
    const r = await svc.ingest(impression);
    expect(r).toEqual({ deduped: false, valid: true, reason: null });
    expect(prismaMock.adEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valid: true, reason: null }) }),
    );
  });

  it("is idempotent on a duplicate (installId, nonce)", async () => {
    prismaMock.adEvent.findUnique.mockResolvedValue({ valid: true, reason: null });
    const r = await svc.ingest(impression);
    expect(r).toEqual({ deduped: true, valid: true, reason: null });
    expect(prismaMock.adEvent.create).not.toHaveBeenCalled();
  });

  it("marks an impression under the 5s threshold invalid", async () => {
    const r = await svc.ingest({ ...impression, nonce: "nonce_bbbb", visibleMs: 1000 });
    expect(r).toMatchObject({ valid: false, reason: "view_too_short" });
    expect(rateMock.takeSpacingSlot).not.toHaveBeenCalled(); // no slot/cap spend on short views
  });

  it("marks an impression invalid when spacing is refused", async () => {
    rateMock.takeSpacingSlot.mockResolvedValue(false);
    const r = await svc.ingest({ ...impression, nonce: "nonce_cccc" });
    expect(r).toMatchObject({ valid: false, reason: "spacing" });
  });

  it("marks an impression invalid when over the hourly cap", async () => {
    rateMock.incrCaps.mockResolvedValue({ withinHourly: false, withinDaily: true });
    const r = await svc.ingest({ ...impression, nonce: "nonce_dddd" });
    expect(r).toMatchObject({ valid: false, reason: "hourly_cap" });
  });

  it("counts a click as valid without view/spacing checks", async () => {
    const r = await svc.ingest({ ...impression, type: "click", nonce: "nonce_eeee", visibleMs: 0 });
    expect(r).toEqual({ deduped: false, valid: true, reason: null });
    expect(rateMock.takeSpacingSlot).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vibearning/api test -- metrics.service`
Expected: FAIL — cannot find `./metrics.service`.

- [ ] **Step 3: Implement `src/metrics/metrics.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type { EventIngest, EventResult } from "@vibearning/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RateLimitService } from "./rate-limit.service";
import { minViewMs } from "./constants";

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async ingest(e: EventIngest): Promise<EventResult> {
    // 1. Dedupe first — retries (extension offline queue) must not spend spacing/caps.
    const existing = await this.prisma.adEvent.findUnique({
      where: { installId_nonce: { installId: e.installId, nonce: e.nonce } },
    });
    if (existing) return { deduped: true, valid: existing.valid, reason: existing.reason ?? null };

    // 2. Validate (impressions only; clicks count directly).
    let valid = true;
    let reason: string | null = null;
    if (e.type === "impression") {
      if (e.visibleMs < minViewMs()) {
        valid = false; reason = "view_too_short";
      } else if (!(await this.rateLimit.takeSpacingSlot(e.installId))) {
        valid = false; reason = "spacing";
      } else {
        const caps = await this.rateLimit.incrCaps(e.installId);
        if (!caps.withinHourly) { valid = false; reason = "hourly_cap"; }
        else if (!caps.withinDaily) { valid = false; reason = "daily_cap"; }
      }
    }

    // 3. Persist; tolerate the rare concurrent-duplicate race via the unique constraint.
    try {
      await this.prisma.adEvent.create({
        data: {
          installId: e.installId, campaignId: e.campaignId, surface: e.surface,
          type: e.type, nonce: e.nonce, visibleMs: e.visibleMs, valid, reason,
        },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === "P2002") {
        const dup = await this.prisma.adEvent.findUnique({
          where: { installId_nonce: { installId: e.installId, nonce: e.nonce } },
        });
        return { deduped: true, valid: dup?.valid ?? false, reason: dup?.reason ?? null };
      }
      throw err;
    }
    return { deduped: false, valid, reason };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vibearning/api test -- metrics.service`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/metrics/metrics.service.ts apps/api/src/metrics/metrics.service.spec.ts
git commit -m "feat(api): metrics service (dedupe + view/spacing/cap validation)"
```

---

## Task 5: Controller + module + `/events` e2e (TDD, real PG+Redis)

**Files:**
- Create: `src/metrics/metrics.controller.ts`, `src/metrics/metrics.module.ts`, `src/metrics/metrics.e2e-spec.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Implement `src/metrics/metrics.controller.ts`**

```ts
import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { eventIngestSchema } from "@vibearning/shared";
import { MetricsService } from "./metrics.service";

@Controller("events")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Post()
  async ingest(@Body() raw: unknown) {
    const parsed = eventIngestSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.metrics.ingest(parsed.data);
  }
}
```

- [ ] **Step 2: Implement `src/metrics/metrics.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { RateLimitService } from "./rate-limit.service";

@Module({ controllers: [MetricsController], providers: [MetricsService, RateLimitService] })
export class MetricsModule {}
```

- [ ] **Step 3: Register `MetricsModule` in `src/app.module.ts`** (add to `imports`)

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RankingModule } from "./ranking/ranking.module";
import { ServeModule } from "./serve/serve.module";
import { AdminModule } from "./admin/admin.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule, MetricsModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 4: Write the e2e test — `src/metrics/metrics.e2e-spec.ts`**

```ts
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
```

- [ ] **Step 5: Run the e2e + full suite to verify**

Run: `pnpm --filter @vibearning/api test`
Expected: all suites PASS (Plan 01 suites + rate-limit + metrics.service + metrics.e2e).

- [ ] **Step 6: Manual smoke (optional)**

With api running (`pnpm --filter @vibearning/api dev`):
```bash
curl -s -X POST localhost:3000/events -H "content-type: application/json" \
  -d '{"installId":"dev1","campaignId":"c1","surface":"claude-code-terminal","type":"impression","nonce":"smoke12345","visibleMs":6000}'
# → {"deduped":false,"valid":true,"reason":null}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/metrics/metrics.controller.ts apps/api/src/metrics/metrics.module.ts apps/api/src/metrics/metrics.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): POST /events endpoint with idempotent metrics ingestion"
```

---

## Done criteria for Plan 02

- [ ] `POST /events` records an `AdEvent`; valid impression → `{deduped:false, valid:true, reason:null}`.
- [ ] Same `(installId, nonce)` again → `{deduped:true, ...}`, no second row, no extra spacing/cap spend.
- [ ] Impression with `visibleMs < 5000` → `valid:false, reason:"view_too_short"`.
- [ ] Spacing + hourly/daily caps enforced (unit-tested in `rate-limit.service.spec`).
- [ ] Malformed body → 400.
- [ ] Full api suite green.

**Next plan:** `03 — Extension` (VS Code extension: 3 adapters, view-tracking timer that produces `visibleMs`, calls `/serve` + `/events`, killswitch). This is the first non-backend slice.
