# Plan 07 — Advertiser + Billing API (demand side) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Let advertisers self-serve via API: register/login (email+password), create a campaign (which ranks a bid so real ads serve), and buy blocks (which `collect`s payment and funds the campaign's escrow in the ledger).

**Architecture:** Advertiser accounts reuse the `Account` table (`type="advertiser"`, `passwordHash`). `AdvertiserAuthService` (bcryptjs) issues the same vibearning JWT (`TokenService`) — `AuthGuard` works unchanged. `CampaignService.create` writes `Campaign(advertiserId)` + `Bid` and calls `RankingService.upsertBid` (so `/serve` can pick it). `BlockPurchaseService.buy` prices `quantity × bidPerBlock`, calls the routed `PaymentProvider.collect`, records a `BlockPurchase`, and credits escrow via `LedgerService.fundEscrow` (debit `cash:platform`, credit `escrow:campaign:<id>`).

**Tech Stack:** Same api stack + `bcryptjs`. **Next.js dashboard UI = Plan 07b (deferred).**

> **Prerequisites:** Plans 01–06 merged. `docker compose up -d`. `packages/shared` built.

> **Follow-ups (noted):** `/serve` should eventually gate on `escrow balance > 0` (out-of-budget campaigns stop serving) — deferred to Plan 08/09. Collect is treated as synchronous `paid` here; redirect/webhook confirmation is a real-PSP follow-up.

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §6, §8, §9.

---

## File Structure

```
packages/shared/src/advertiser.ts        + advertiser.test.ts ; index.ts (MODIFY)
apps/api/
  prisma/schema.prisma                    # Account.passwordHash+campaigns, Campaign.advertiser+purchases, BlockPurchase (MODIFY)
  src/advertiser/advertiser-auth.service.ts      + .spec.ts
  src/advertiser/advertiser-auth.controller.ts   # POST /advertiser/register, /advertiser/login
  src/advertiser/campaign.service.ts             + .spec.ts
  src/advertiser/block-purchase.service.ts       + .spec.ts
  src/advertiser/advertiser.controller.ts        # POST /advertiser/campaigns, POST /advertiser/campaigns/:id/blocks, GET /advertiser/campaigns (AuthGuard)
  src/advertiser/advertiser.module.ts
  src/advertiser/advertiser.e2e-spec.ts
  src/ledger/ledger.service.ts            # + fundEscrow + escrowBalance (MODIFY)
  src/ledger/ledger.service.spec.ts       # + fundEscrow test (MODIFY)
  src/payments/payments.module.ts         # export PaymentRouter (MODIFY)
  src/app.module.ts                       # + AdvertiserModule (MODIFY)
```

---

## Task 1: Schema — advertiser/campaign/purchase relations

- [ ] **Step 1: Modify `Account`** — add `passwordHash` + `campaigns`

```prisma
  passwordHash String?
  campaigns    Campaign[]
```
(add inside the `Account` model, alongside `events` / `payouts`)

- [ ] **Step 2: Modify `Campaign`** — add advertiser relation + purchases

```prisma
  advertiserId String?
  advertiser   Account?        @relation(fields: [advertiserId], references: [id])
  purchases    BlockPurchase[]
```
(add inside the `Campaign` model, before its closing `}`)

- [ ] **Step 3: Append the `BlockPurchase` model**

```prisma
model BlockPurchase {
  id          String   @id @default(cuid())
  campaign    Campaign @relation(fields: [campaignId], references: [id])
  campaignId  String
  quantity    Int
  amountPaise Int
  currency    String   @default("INR")
  status      String   // paid | pending | failed
  providerRef String?
  createdAt   DateTime @default(now())

  @@index([campaignId])
}
```

- [ ] **Step 4: Apply + regenerate + commit**

```bash
pnpm --filter @vibearning/api exec prisma db push
pnpm --filter @vibearning/api exec prisma generate
git add apps/api/prisma
git commit -m "feat(api): advertiser/campaign/BlockPurchase schema relations"
```

---

## Task 2: Shared — advertiser DTOs (TDD)

**Files:** Create `packages/shared/src/advertiser.ts`, `advertiser.test.ts`; Modify `index.ts`

- [ ] **Step 1: Failing test — `src/advertiser.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { advertiserRegisterSchema, createCampaignSchema, buyBlocksSchema } from "./advertiser";

describe("advertiser schemas", () => {
  it("register requires email + 8-char password", () => {
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(advertiserRegisterSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
  });
  it("createCampaign validates copy length, url, surface, positive bid", () => {
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).success).toBe(true);
    expect(createCampaignSchema.safeParse({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 0 }).success).toBe(false);
  });
  it("buyBlocks requires a positive integer quantity", () => {
    expect(buyBlocksSchema.safeParse({ quantity: 5 }).success).toBe(true);
    expect(buyBlocksSchema.safeParse({ quantity: 0 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @vibearning/shared test`)

- [ ] **Step 3: Implement `src/advertiser.ts`**

```ts
import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const advertiserRegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
export type AdvertiserRegister = z.infer<typeof advertiserRegisterSchema>;

export const advertiserLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export type AdvertiserLogin = z.infer<typeof advertiserLoginSchema>;

export const createCampaignSchema = z.object({
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().optional(),
  surface: surfaceSchema,
  bidPerBlockPaise: z.number().int().positive(),
});
export type CreateCampaign = z.infer<typeof createCampaignSchema>;

export const buyBlocksSchema = z.object({ quantity: z.number().int().positive() });
export type BuyBlocks = z.infer<typeof buyBlocksSchema>;
```

- [ ] **Step 4: Modify `index.ts`** — append `export * from "./advertiser";`

- [ ] **Step 5: Run → PASS, then rebuild + commit**

```bash
pnpm --filter @vibearning/shared test
pnpm --filter @vibearning/shared build
git add packages/shared
git commit -m "feat(shared): advertiser register/login/campaign/blocks DTOs"
```

---

## Task 3: `LedgerService.fundEscrow` + payments export (TDD)

**Files:** Modify `src/ledger/ledger.service.ts`, `ledger.service.spec.ts`, `src/payments/payments.module.ts`

- [ ] **Step 1: Failing tests — append to `ledger.service.spec.ts`**

```ts
  it("fundEscrow debits cash and credits the campaign escrow", async () => {
    await svc.fundEscrow("buy1", "c1", 200000);
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ account: string; direction: string; amount: number }>;
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ account: "cash:platform", direction: "debit", amount: 200000 }),
      expect.objectContaining({ account: "escrow:campaign:c1", direction: "credit", amount: 200000 }),
    ]));
  });
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @vibearning/api test -- ledger.service`)

- [ ] **Step 3: Add `fundEscrow` + `escrowBalance` to `ledger.service.ts`**

```ts
  async fundEscrow(sourceId: string, campaignId: string, amountPaise: number): Promise<void> {
    if (amountPaise <= 0) return;
    const already = await this.prisma.ledgerEntry.count({ where: { eventId: sourceId } });
    if (already > 0) return;
    await this.prisma.ledgerEntry.createMany({
      data: [
        { eventId: sourceId, account: "cash:platform", direction: "debit", amount: amountPaise },
        { eventId: sourceId, account: `escrow:campaign:${campaignId}`, direction: "credit", amount: amountPaise },
      ],
      skipDuplicates: true,
    });
  }

  async escrowBalance(campaignId: string): Promise<number> {
    return this.balance(`escrow:campaign:${campaignId}`);
  }
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Export `PaymentRouter` from `payments.module.ts`** — add `exports: [PaymentRouter],` to the `@Module`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ledger/ledger.service.ts apps/api/src/ledger/ledger.service.spec.ts apps/api/src/payments/payments.module.ts
git commit -m "feat(api): LedgerService.fundEscrow + export PaymentRouter"
```

---

## Task 4: Advertiser auth (bcryptjs, TDD)

**Files:** add dep; Create `advertiser-auth.service.ts`, `.spec.ts`, `advertiser-auth.controller.ts`

- [ ] **Step 1: Install bcryptjs** — `pnpm --filter @vibearning/api add bcryptjs && pnpm --filter @vibearning/api add -D @types/bcryptjs`

- [ ] **Step 2: Failing test — `src/advertiser/advertiser-auth.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { AdvertiserAuthService } from "./advertiser-auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";

const prismaMock = { account: { findFirst: jest.fn(), create: jest.fn() } };
const tokenMock = { issue: jest.fn().mockReturnValue("kbi.jwt") };

describe("AdvertiserAuthService", () => {
  let svc: AdvertiserAuthService;
  beforeEach(async () => {
    jest.resetAllMocks();
    tokenMock.issue.mockReturnValue("kbi.jwt");
    const mod = await Test.createTestingModule({
      providers: [
        AdvertiserAuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TokenService, useValue: tokenMock },
      ],
    }).compile();
    svc = mod.get(AdvertiserAuthService);
  });

  it("registers a new advertiser and returns a token", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    prismaMock.account.create.mockResolvedValue({ id: "adv1", email: "a@b.com", type: "advertiser" });
    const res = await svc.register("a@b.com", "password1");
    expect(prismaMock.account.create).toHaveBeenCalled();
    expect(res).toEqual({ token: "kbi.jwt", account: { id: "adv1", email: "a@b.com", type: "advertiser" } });
  });

  it("rejects duplicate registration", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "adv1" });
    await expect(svc.register("a@b.com", "password1")).rejects.toBeTruthy();
  });

  it("logs in with correct password and rejects wrong password", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("password1", 8);
    prismaMock.account.findFirst.mockResolvedValue({ id: "adv1", email: "a@b.com", type: "advertiser", passwordHash: hash });
    await expect(svc.login("a@b.com", "password1")).resolves.toMatchObject({ token: "kbi.jwt" });
    await expect(svc.login("a@b.com", "wrong")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implement `src/advertiser/advertiser-auth.service.ts`**

```ts
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";

@Injectable()
export class AdvertiserAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private result(account: { id: string; email: string | null; type: string }) {
    return { token: this.tokens.issue(account.id), account: { id: account.id, email: account.email, type: account.type } };
  }

  async register(email: string, password: string) {
    const existing = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (existing) throw new BadRequestException("email_taken");
    const passwordHash = await bcrypt.hash(password, 8);
    const account = await this.prisma.account.create({ data: { type: "advertiser", email, passwordHash } });
    return this.result(account);
  }

  async login(email: string, password: string) {
    const account = await this.prisma.account.findFirst({ where: { email, type: "advertiser" } });
    if (!account?.passwordHash || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new UnauthorizedException("invalid_credentials");
    }
    return this.result(account);
  }
}
```

- [ ] **Step 5: Run → PASS**

- [ ] **Step 6: Implement `src/advertiser/advertiser-auth.controller.ts`**

```ts
import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { advertiserRegisterSchema, advertiserLoginSchema } from "@vibearning/shared";
import { AdvertiserAuthService } from "./advertiser-auth.service";

@Controller("advertiser")
export class AdvertiserAuthController {
  constructor(private readonly auth: AdvertiserAuthService) {}

  @Post("register")
  async register(@Body() raw: unknown) {
    const p = advertiserRegisterSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.register(p.data.email, p.data.password);
  }

  @Post("login")
  async login(@Body() raw: unknown) {
    const p = advertiserLoginSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.auth.login(p.data.email, p.data.password);
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/advertiser/advertiser-auth.service.ts apps/api/src/advertiser/advertiser-auth.service.spec.ts apps/api/src/advertiser/advertiser-auth.controller.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): advertiser email+password auth (bcryptjs)"
```

---

## Task 5: Campaign + BlockPurchase services (TDD)

**Files:** Create `campaign.service.ts`, `.spec.ts`, `block-purchase.service.ts`, `.spec.ts`

- [ ] **Step 1: Failing test — `src/advertiser/campaign.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { CampaignService } from "./campaign.service";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const prismaMock = { campaign: { create: jest.fn() }, bid: { create: jest.fn() } };
const rankingMock = { upsertBid: jest.fn() };

describe("CampaignService", () => {
  let svc: CampaignService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.campaign.create.mockResolvedValue({ id: "c1" });
    const mod = await Test.createTestingModule({
      providers: [
        CampaignService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingService, useValue: rankingMock },
      ],
    }).compile();
    svc = mod.get(CampaignService);
  });

  it("creates a campaign + bid and ranks the bid", async () => {
    const dto = { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" as const, bidPerBlockPaise: 20000 };
    const c = await svc.create("adv1", dto);
    expect(prismaMock.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ advertiserId: "adv1", copy: "Hi there", isHouseAd: false }) }),
    );
    expect(prismaMock.bid.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ campaignId: "c1", surface: "codex-panel", amount: 20000 }) }),
    );
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 20000);
    expect(c).toMatchObject({ id: "c1" });
  });
});
```

- [ ] **Step 2: Run → FAIL; implement `src/advertiser/campaign.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type { CreateCampaign } from "@vibearning/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  async create(advertiserId: string, dto: CreateCampaign) {
    const campaign = await this.prisma.campaign.create({
      data: { advertiserId, copy: dto.copy, url: dto.url, iconUrl: dto.iconUrl ?? null, isHouseAd: false },
    });
    await this.prisma.bid.create({
      data: { campaignId: campaign.id, surface: dto.surface, amount: dto.bidPerBlockPaise, status: "active" },
    });
    await this.ranking.upsertBid(dto.surface, campaign.id, dto.bidPerBlockPaise);
    return campaign;
  }
}
```

- [ ] **Step 3: Run → PASS**

- [ ] **Step 4: Failing test — `src/advertiser/block-purchase.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { BlockPurchaseService } from "./block-purchase.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "../payments/payment-router";

const prismaMock = {
  campaign: { findUnique: jest.fn() },
  account: { findUnique: jest.fn() },
  blockPurchase: { create: jest.fn() },
};
const ledgerMock = { fundEscrow: jest.fn() };
const provider = { name: "razorpay", collect: jest.fn(), payout: jest.fn() };
const routerMock = { forCountry: jest.fn().mockReturnValue(provider) };

describe("BlockPurchaseService", () => {
  let svc: BlockPurchaseService;
  beforeEach(async () => {
    jest.resetAllMocks();
    routerMock.forCountry.mockReturnValue(provider);
    prismaMock.campaign.findUnique.mockResolvedValue({ id: "c1", advertiserId: "adv1", bids: [{ surface: "codex-panel", amount: 20000, status: "active" }] });
    prismaMock.account.findUnique.mockResolvedValue({ id: "adv1", country: "IN" });
    prismaMock.blockPurchase.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "buy1", ...a.data }));
    const mod = await Test.createTestingModule({
      providers: [
        BlockPurchaseService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
        { provide: PaymentRouter, useValue: routerMock },
      ],
    }).compile();
    svc = mod.get(BlockPurchaseService);
  });

  it("collects quantity×bid and funds escrow", async () => {
    provider.collect.mockResolvedValue({ providerRef: "rzp_c1", status: "paid" });
    const purchase = await svc.buy("adv1", "c1", 5); // 5 × 20000 = 100000
    expect(provider.collect).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 100000, currency: "INR" }));
    expect(prismaMock.blockPurchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ campaignId: "c1", quantity: 5, amountPaise: 100000, status: "paid" }) }),
    );
    expect(ledgerMock.fundEscrow).toHaveBeenCalledWith("buy1", "c1", 100000);
    expect(purchase).toMatchObject({ id: "buy1", status: "paid" });
  });

  it("rejects buying for a campaign you don't own", async () => {
    await expect(svc.buy("someone_else", "c1", 5)).rejects.toBeInstanceOf(ForbiddenException);
    expect(provider.collect).not.toHaveBeenCalled();
  });

  it("does not fund escrow on a failed collect", async () => {
    provider.collect.mockResolvedValue({ providerRef: "rzp_c2", status: "failed" });
    await svc.buy("adv1", "c1", 5);
    expect(ledgerMock.fundEscrow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run → FAIL; implement `src/advertiser/block-purchase.service.ts`**

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "../payments/payment-router";

@Injectable()
export class BlockPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly router: PaymentRouter,
  ) {}

  async buy(advertiserId: string, campaignId: string, quantity: number) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId }, include: { bids: true } });
    if (!campaign) throw new NotFoundException("campaign_not_found");
    if (campaign.advertiserId !== advertiserId) throw new ForbiddenException("not_your_campaign");

    const bid = campaign.bids.find((b) => b.status === "active");
    if (!bid) throw new BadRequestException("campaign_has_no_active_bid");

    const amountPaise = quantity * bid.amount;
    const advertiser = await this.prisma.account.findUnique({ where: { id: advertiserId } });
    const provider = this.router.forCountry(advertiser?.country ?? null);
    const result = await provider.collect({ amountPaise, currency: "INR", description: `blocks:${campaignId}` });

    const purchase = await this.prisma.blockPurchase.create({
      data: { campaignId, quantity, amountPaise, currency: "INR", status: result.status, providerRef: result.providerRef },
    });
    if (result.status !== "failed") {
      await this.ledger.fundEscrow(purchase.id, campaignId, amountPaise);
    }
    return purchase;
  }
}
```

- [ ] **Step 6: Run → PASS; commit**

```bash
git add apps/api/src/advertiser/campaign.service.ts apps/api/src/advertiser/campaign.service.spec.ts apps/api/src/advertiser/block-purchase.service.ts apps/api/src/advertiser/block-purchase.service.spec.ts
git commit -m "feat(api): campaign creation (ranked) + block purchase (collect->escrow)"
```

---

## Task 6: Controller + module + e2e

**Files:** Create `advertiser.controller.ts`, `advertiser.module.ts`, `advertiser.e2e-spec.ts`; Modify `app.module.ts`

- [ ] **Step 1: `src/advertiser/advertiser.controller.ts`**

```ts
import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { createCampaignSchema, buyBlocksSchema } from "@vibearning/shared";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CampaignService } from "./campaign.service";
import { BlockPurchaseService } from "./block-purchase.service";

@Controller("advertiser/campaigns")
@UseGuards(AuthGuard)
export class AdvertiserController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly purchases: BlockPurchaseService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Req() req: { account: { id: string } }, @Body() raw: unknown) {
    const p = createCampaignSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.campaigns.create(req.account.id, p.data);
  }

  @Get()
  async list(@Req() req: { account: { id: string } }) {
    return this.prisma.campaign.findMany({ where: { advertiserId: req.account.id }, orderBy: { createdAt: "desc" } });
  }

  @Post(":id/blocks")
  async buy(@Req() req: { account: { id: string } }, @Param("id") id: string, @Body() raw: unknown) {
    const p = buyBlocksSchema.safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    return this.purchases.buy(req.account.id, id, p.data.quantity);
  }
}
```

- [ ] **Step 2: `src/advertiser/advertiser.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { PaymentsModule } from "../payments/payments.module";
import { AdvertiserAuthService } from "./advertiser-auth.service";
import { AdvertiserAuthController } from "./advertiser-auth.controller";
import { CampaignService } from "./campaign.service";
import { BlockPurchaseService } from "./block-purchase.service";
import { AdvertiserController } from "./advertiser.controller";

@Module({
  imports: [AuthModule, LedgerModule, PaymentsModule],
  controllers: [AdvertiserAuthController, AdvertiserController],
  providers: [AdvertiserAuthService, CampaignService, BlockPurchaseService],
})
export class AdvertiserModule {}
```

> `RankingService` (used by `CampaignService`) comes from the global `RankingModule`; `TokenService`/`AuthGuard` from `AuthModule`; `PaymentRouter` from `PaymentsModule` (now exported).

- [ ] **Step 3: Register `AdvertiserModule` in `app.module.ts`** (add import + to `imports`)

- [ ] **Step 4: e2e — `src/advertiser/advertiser.e2e-spec.ts`** (override `PaymentRouter` collect)

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PaymentRouter } from "../payments/payment-router";
import { PrismaService } from "../prisma/prisma.service";

describe("/advertiser (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `adv_${Date.now()}@x.com`;
  let token: string;

  beforeAll(async () => {
    const fakeProvider = { name: "razorpay", collect: async () => ({ providerRef: "rzp_buy", status: "paid" }), payout: async () => ({ providerRef: "x", status: "paid" }) };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => { await app.close(); });

  it("registers, creates a campaign, buys blocks, funds escrow", async () => {
    const reg = await request(app.getHttpServer()).post("/advertiser/register").send({ email, password: "password1" }).expect(201);
    token = reg.body.token;
    expect(reg.body.account.type).toBe("advertiser");

    const camp = await request(app.getHttpServer())
      .post("/advertiser/campaigns").set("authorization", `Bearer ${token}`)
      .send({ copy: "Buy our SaaS", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 }).expect(201);
    const campaignId = camp.body.id;

    const buy = await request(app.getHttpServer())
      .post(`/advertiser/campaigns/${campaignId}/blocks`).set("authorization", `Bearer ${token}`)
      .send({ quantity: 5 }).expect(201);
    expect(buy.body).toMatchObject({ quantity: 5, amountPaise: 100000, status: "paid" });

    const escrow = await prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaignId}`, direction: "credit" } });
    expect(escrow.reduce((s, e) => s + e.amount, 0)).toBe(100000);
  });

  it("requires auth to create a campaign", async () => {
    await request(app.getHttpServer()).post("/advertiser/campaigns").send({}).expect(401);
  });

  it("logs in an existing advertiser", async () => {
    await request(app.getHttpServer()).post("/advertiser/login").send({ email, password: "password1" }).expect(201);
    await request(app.getHttpServer()).post("/advertiser/login").send({ email, password: "nope" }).expect(401);
  });
});
```

- [ ] **Step 5: Run FULL api suite** — `pnpm --filter @vibearning/api test` → all green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/advertiser/advertiser.controller.ts apps/api/src/advertiser/advertiser.module.ts apps/api/src/advertiser/advertiser.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): advertiser campaigns + block-purchase endpoints + e2e"
```

---

## Done criteria for Plan 07

- [ ] Advertiser can register/login (email+password) and gets a vibearning token; wrong password → 401; duplicate email → 400.
- [ ] Creating a campaign writes Campaign+Bid and ranks the bid (so `/serve` can pick it).
- [ ] Buying blocks collects `quantity×bid`, records a `BlockPurchase`, and credits `escrow:campaign:<id>`; not-owner → 403; failed collect → no escrow.
- [ ] Full api suite green.

**Next plans:** `07b — Next.js advertiser portal UI` (over this API); then `08 — Auction` (escrow-gated serving, served-price accounting); `09 — Fraud + hardening`.
