# Plan 08 — Auction: escrow-gated serving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Stop serving paid campaigns that are out of budget. `/serve` walks the bid-ranked list for a surface and returns the first **active** campaign that is either a house ad or has a positive escrow balance — so an unfunded/exhausted campaign is skipped instead of serving free impressions.

**Architecture:** `RankingService.topCampaigns(surface, n)` returns the ranked list (not just #1). `ServeService.pickAd` iterates it, fetching each `Campaign` and (for non-house ads) checking `LedgerService.escrowBalance(campaignId) > 0`, returning the first servable one. House ads (no bid/escrow) remain the always-available fallback.

**Tech Stack:** Same api stack. No schema change.

> **Prerequisites:** Plans 01–07 merged. `docker compose up -d`. `packages/shared` built.

> **Scope note:** This gates at serve time (the cheap, high-value win). Exact served-price/2nd-price accounting and a per-impression escrow reservation (to fully eliminate the serve→impression race) are deferred — the ledger already debits escrow per impression (Plan 05), so overspend is bounded to in-flight impressions.

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §8.

---

## Task 1: `RankingService.topCampaigns` (TDD)

**Files:** Modify `src/ranking/ranking.service.ts`, `ranking.service.spec.ts`

- [ ] **Step 1: Add failing tests — append to `ranking.service.spec.ts` describe block**

```ts
  it("topCampaigns returns the ranked list high→low", async () => {
    await ranking.upsertBid("codex-panel", "low", 100);
    await ranking.upsertBid("codex-panel", "high", 500);
    await ranking.upsertBid("codex-panel", "mid", 300);
    expect(await ranking.topCampaigns("codex-panel", 10)).toEqual(["high", "mid", "low"]);
  });

  it("topCampaigns returns [] for an empty surface", async () => {
    expect(await ranking.topCampaigns("codex-panel", 10)).toEqual([]);
  });
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @vibearning/api test -- ranking`)

- [ ] **Step 3: Add `topCampaigns` to `ranking.service.ts`**

```ts
  async topCampaigns(surface: string, n: number): Promise<string[]> {
    if (n <= 0) return [];
    return this.redis.zrevrange(key(surface), 0, n - 1);
  }
```

- [ ] **Step 4: Run → PASS, commit**

```bash
git add apps/api/src/ranking/ranking.service.ts apps/api/src/ranking/ranking.service.spec.ts
git commit -m "feat(api): RankingService.topCampaigns (ranked list)"
```

---

## Task 2: `ServeService` escrow gate (TDD)

**Files:** Modify `src/serve/serve.service.ts`, `serve.service.spec.ts`, `serve.module.ts`

- [ ] **Step 1: Replace `serve.service.spec.ts`** (now drives `topCampaigns` + escrow gate)

```ts
import { Test } from "@nestjs/testing";
import { ServeService } from "./serve.service";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const rankingMock = { topCampaigns: jest.fn() };
const prismaMock = { campaign: { findUnique: jest.fn() } };
const ledgerMock = { escrowBalance: jest.fn() };

const paid = (id: string) => ({ id, copy: `ad ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: false, status: "active" });
const house = (id: string) => ({ id, copy: `house ${id}`, url: "https://x.dev", iconUrl: null, isHouseAd: true, status: "active" });

describe("ServeService", () => {
  let service: ServeService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ServeService,
        { provide: RankingService, useValue: rankingMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
      ],
    }).compile();
    service = mod.get(ServeService);
  });

  it("serves the top paid campaign when it has escrow", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A"]);
    prismaMock.campaign.findUnique.mockResolvedValue(paid("A"));
    ledgerMock.escrowBalance.mockResolvedValue(5000);
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "A", isHouseAd: false });
  });

  it("skips an out-of-budget paid campaign and serves the next funded one", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A", "B"]);
    prismaMock.campaign.findUnique.mockImplementation(async ({ where: { id } }: any) => (id === "A" ? paid("A") : paid("B")));
    ledgerMock.escrowBalance.mockImplementation(async (id: string) => (id === "A" ? 0 : 5000));
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "B" });
  });

  it("serves a house ad regardless of escrow", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["H"]);
    prismaMock.campaign.findUnique.mockResolvedValue(house("H"));
    expect(await service.pickAd("codex-panel")).toMatchObject({ campaignId: "H", isHouseAd: true });
    expect(ledgerMock.escrowBalance).not.toHaveBeenCalled();
  });

  it("returns null when nothing is servable", async () => {
    rankingMock.topCampaigns.mockResolvedValue(["A"]);
    prismaMock.campaign.findUnique.mockResolvedValue(paid("A"));
    ledgerMock.escrowBalance.mockResolvedValue(0);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });

  it("returns null when nothing ranked", async () => {
    rankingMock.topCampaigns.mockResolvedValue([]);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @vibearning/api test -- serve.service`)

- [ ] **Step 3: Rewrite `src/serve/serve.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type { ServeResponse } from "@vibearning/shared";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";

const MAX_CANDIDATES = 10;

@Injectable()
export class ServeService {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async pickAd(surface: string): Promise<ServeResponse | null> {
    const ids = await this.ranking.topCampaigns(surface, MAX_CANDIDATES);
    for (const id of ids) {
      const c = await this.prisma.campaign.findUnique({ where: { id } });
      if (!c || c.status !== "active") continue;
      if (!c.isHouseAd && (await this.ledger.escrowBalance(id)) <= 0) continue; // out of budget
      return {
        adId: c.id, campaignId: c.id, copy: c.copy, url: c.url, iconUrl: c.iconUrl, isHouseAd: c.isHouseAd,
      };
    }
    return null;
  }
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Modify `src/serve/serve.module.ts`** — import `LedgerModule` (for `LedgerService`)

```ts
import { Module } from "@nestjs/common";
import { ServeController } from "./serve.controller";
import { ServeService } from "./serve.service";
import { LedgerModule } from "../ledger/ledger.module";

// RankingService comes from the global RankingModule; LedgerService from LedgerModule.
@Module({ imports: [LedgerModule], controllers: [ServeController], providers: [ServeService] })
export class ServeModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/serve/serve.service.ts apps/api/src/serve/serve.service.spec.ts apps/api/src/serve/serve.module.ts
git commit -m "feat(api): escrow-gated serving (skip out-of-budget campaigns)"
```

---

## Task 3: e2e — funded vs unfunded serving

**Files:** Create `src/serve/auction.e2e-spec.ts`

- [ ] **Step 1: Write the e2e** (advertiser funds a lower bid; a higher unfunded bid is skipped)

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PaymentRouter } from "../payments/payment-router";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("auction escrow-gating (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let token: string;

  beforeAll(async () => {
    const fakeProvider = { name: "razorpay", collect: async () => ({ providerRef: "rzp", status: "paid" }), payout: async () => ({ providerRef: "x", status: "paid" }) };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    await redis.flushall();
    await prisma.blockPurchase.deleteMany();
    await prisma.bid.deleteMany();
    await prisma.campaign.deleteMany();

    const reg = await request(app.getHttpServer()).post("/advertiser/register").send({ email: `auc_${Date.now()}@x.com`, password: "password1" });
    token = reg.body.token;

    // Funded campaign A (lower bid).
    const a = await request(app.getHttpServer()).post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "FUNDED-A", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 10000 });
    await request(app.getHttpServer()).post(`/advertiser/campaigns/${a.body.id}/blocks`).set("authorization", `Bearer ${token}`).send({ quantity: 3 });

    // Unfunded campaign B (HIGHER bid → ranks first, but no escrow).
    await request(app.getHttpServer()).post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "UNFUNDED-B", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 30000 });
  });
  afterAll(async () => { await app.close(); });

  it("skips the higher unfunded bid and serves the funded campaign", async () => {
    const res = await request(app.getHttpServer()).get("/serve?surface=codex-panel").expect(200);
    expect(res.body.ad.copy).toBe("FUNDED-A");
  });
});
```

- [ ] **Step 2: Run the FULL api suite** — `pnpm --filter @vibearning/api test` → all green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/serve/auction.e2e-spec.ts
git commit -m "test(api): escrow-gating e2e (funded served, unfunded skipped)"
```

---

## Done criteria for Plan 08

- [ ] `/serve` returns the top-ranked **funded** active campaign; house ads always servable; out-of-budget paid campaigns skipped; null when nothing servable.
- [ ] Full api suite green.

**Next plan:** `09 — Fraud + hardening` (`GET /config` killswitch endpoint wiring the extension poller, multi-account/IP clustering signals, creative moderation, observability).
