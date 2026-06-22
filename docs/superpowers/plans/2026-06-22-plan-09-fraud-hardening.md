# Plan 09 — Fraud + hardening (killswitch + suspension) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Ship the server-side controls the system was missing: a global **killswitch** (`GET /config` → `{active}`, the endpoint the extension already polls) with an admin toggle, and **account suspension** that blocks a suspended account from cashing out.

**Architecture:** `Killswitch` table + `KillswitchService` (upsert/read by scope). `ConfigController` exposes public `GET /config`. `AdminConfigController` (x-admin-key, same pattern as house-ads admin) toggles the killswitch and suspends accounts. `PayoutService` refuses payouts for suspended accounts.

**Tech Stack:** Same api stack.

> **Prerequisites:** Plans 01–08 merged. `docker compose up -d`. `packages/shared` built.

> **Explicitly out of scope (documented remaining hardening):** multi-account/IP-hash clustering (needs `ipHash` plumbed through events + a `dev_installs` table — not yet stored), creative moderation (campaign `pending→approved` ripples into Plan 07/08 serving and is a separate slice), pacing/delivery-speed, structured observability/metrics. These remain follow-ups; fraud defense is iterative.

**Spec:** [2026-06-22-kickbacks-india-ad-marketplace-design.md](../specs/2026-06-22-kickbacks-india-ad-marketplace-design.md) §10.

---

## File Structure

```
apps/api/
  prisma/schema.prisma                  # + Killswitch model, Account.suspended (MODIFY)
  src/config/killswitch.service.ts      + .spec.ts
  src/config/config.controller.ts       # GET /config (public)
  src/config/admin-config.controller.ts # POST /admin/killswitch, /admin/accounts/:id/suspend (x-admin-key)
  src/config/config.module.ts
  src/config/config.e2e-spec.ts
  src/payments/payout.service.ts        # refuse suspended (MODIFY)
  src/payments/payout.service.spec.ts   # + suspended test (MODIFY)
  src/app.module.ts                     # + ConfigModule (MODIFY)
```

---

## Task 1: Schema — `Killswitch` + `Account.suspended`

- [ ] **Step 1: Add to `Account`** (inside the model): `suspended Boolean @default(false)`

- [ ] **Step 2: Append the `Killswitch` model**

```prisma
model Killswitch {
  id        String   @id @default(cuid())
  scope     String   @unique
  active    Boolean  @default(false)
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 3: Apply + regenerate + commit**

```bash
pnpm --filter @kbi/api exec prisma db push
pnpm --filter @kbi/api exec prisma generate
git add apps/api/prisma
git commit -m "feat(api): add Killswitch model + Account.suspended"
```

---

## Task 2: KillswitchService + controllers + module (TDD)

**Files:** Create `src/config/{killswitch.service.ts,killswitch.service.spec.ts,config.controller.ts,admin-config.controller.ts,config.module.ts}`; Modify `app.module.ts`

- [ ] **Step 1: Failing test — `src/config/killswitch.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { KillswitchService } from "./killswitch.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { killswitch: { findUnique: jest.fn(), upsert: jest.fn() } };

describe("KillswitchService", () => {
  let svc: KillswitchService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [KillswitchService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    svc = mod.get(KillswitchService);
  });

  it("defaults to inactive when no row exists", async () => {
    prismaMock.killswitch.findUnique.mockResolvedValue(null);
    expect(await svc.isActive("global")).toBe(false);
  });
  it("reads the stored active flag", async () => {
    prismaMock.killswitch.findUnique.mockResolvedValue({ active: true });
    expect(await svc.isActive("global")).toBe(true);
  });
  it("set upserts the scope", async () => {
    await svc.set("global", true);
    expect(prismaMock.killswitch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scope: "global" }, update: { active: true }, create: { scope: "global", active: true } }),
    );
  });
});
```

- [ ] **Step 2: Run → FAIL; implement `src/config/killswitch.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class KillswitchService {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(scope = "global"): Promise<boolean> {
    const row = await this.prisma.killswitch.findUnique({ where: { scope } });
    return row?.active ?? false;
  }

  async set(scope: string, active: boolean): Promise<void> {
    await this.prisma.killswitch.upsert({
      where: { scope },
      update: { active },
      create: { scope, active },
    });
  }
}
```

- [ ] **Step 3: Run → PASS**

- [ ] **Step 4: Implement `src/config/config.controller.ts`** (public — the extension polls this)

```ts
import { Controller, Get } from "@nestjs/common";
import { KillswitchService } from "./killswitch.service";

@Controller("config")
export class ConfigController {
  constructor(private readonly killswitch: KillswitchService) {}

  @Get()
  async config() {
    return { active: await this.killswitch.isActive("global") };
  }
}
```

- [ ] **Step 5: Implement `src/config/admin-config.controller.ts`** (x-admin-key)

```ts
import { BadRequestException, Body, Controller, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { KillswitchService } from "./killswitch.service";

function requireAdmin(key: string | undefined): void {
  if (!key || key !== process.env.ADMIN_API_KEY) throw new UnauthorizedException();
}

@Controller("admin")
export class AdminConfigController {
  constructor(
    private readonly killswitch: KillswitchService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("killswitch")
  async toggle(@Headers("x-admin-key") key: string, @Body() raw: unknown) {
    requireAdmin(key);
    const p = z.object({ active: z.boolean(), scope: z.string().default("global") }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.killswitch.set(p.data.scope, p.data.active);
    return { ok: true };
  }

  @Post("accounts/:id/suspend")
  async suspend(@Headers("x-admin-key") key: string, @Param("id") id: string, @Body() raw: unknown) {
    requireAdmin(key);
    const p = z.object({ suspended: z.boolean() }).safeParse(raw);
    if (!p.success) throw new BadRequestException(p.error.flatten());
    await this.prisma.account.update({ where: { id }, data: { suspended: p.data.suspended } });
    return { ok: true };
  }
}
```

- [ ] **Step 6: Implement `src/config/config.module.ts`** + register in `app.module.ts`

```ts
import { Module } from "@nestjs/common";
import { KillswitchService } from "./killswitch.service";
import { ConfigController } from "./config.controller";
import { AdminConfigController } from "./admin-config.controller";

@Module({
  controllers: [ConfigController, AdminConfigController],
  providers: [KillswitchService],
})
export class ConfigModule {}
```

(Add `import { ConfigModule } from "./config/config.module";` to `app.module.ts` and to the `imports` array.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config apps/api/src/app.module.ts
git commit -m "feat(api): killswitch service + GET /config + admin toggle/suspend"
```

---

## Task 3: Payout refuses suspended accounts (TDD)

**Files:** Modify `src/payments/payout.service.ts`, `payout.service.spec.ts`

- [ ] **Step 1: Add the failing test — append to `payout.service.spec.ts` describe block**

```ts
  it("refuses payout for a suspended account", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(15000);
    prismaMock.account.findUnique.mockResolvedValue({ id: "acc1", country: "IN", suspended: true });
    await expect(svc.requestPayout("acc1")).rejects.toBeTruthy();
    expect(provider.payout).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run → FAIL** (payout proceeds for suspended)

- [ ] **Step 3: Modify `payout.service.ts`** — check suspension after loading the account, before paying

Replace the account-load + provider block so it reads:

```ts
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (account?.suspended) throw new ForbiddenException("account_suspended");
    const provider = this.router.forCountry(account?.country ?? null);
```

(Add `ForbiddenException` to the `@nestjs/common` import.)

- [ ] **Step 4: Run → PASS; commit**

```bash
git add apps/api/src/payments/payout.service.ts apps/api/src/payments/payout.service.spec.ts
git commit -m "feat(api): block payouts for suspended accounts"
```

---

## Task 4: e2e — killswitch toggle + suspension blocks payout

**Files:** Create `src/config/config.e2e-spec.ts`

- [ ] **Step 1: Write the e2e**

```ts
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

  it("blocks a suspended account from cashing out", async () => {
    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    const accountId = login.body.account.id;
    await prisma.ledgerEntry.deleteMany({ where: { account: `earnings:dev:${accountId}` } });
    await prisma.ledgerEntry.create({ data: { eventId: `fraud_seed_${accountId}`, account: `earnings:dev:${accountId}`, direction: "credit", amount: 15000 } });

    await request(app.getHttpServer()).post(`/admin/accounts/${accountId}/suspend`).set("x-admin-key", ADMIN).send({ suspended: true }).expect(201);
    await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${login.body.token}`).expect(403);
  });
});
```

- [ ] **Step 2: Run the FULL api suite** — `pnpm --filter @kbi/api test` → all green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/config/config.e2e-spec.ts
git commit -m "test(api): killswitch toggle + suspended-account payout block e2e"
```

---

## Done criteria for Plan 09

- [ ] `GET /config` returns `{active}` (the extension's killswitch source); admin can toggle it (x-admin-key), unauth toggle → 401.
- [ ] Admin can suspend an account; a suspended account's `POST /payouts` → 403.
- [ ] Full api suite green.

**Remaining (documented follow-ups):** Next.js portal UI (07b); real Stripe/Razorpay SDK + KYC; real spinner-injection adapters; IP-hash clustering; creative moderation; pacing; observability. The core marketplace is functionally complete and fully tested behind these seams.
