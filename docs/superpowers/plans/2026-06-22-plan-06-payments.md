# Plan 06 — Payments (dual-provider payout of earnings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Let a dev cash out their ledger earnings balance through a dual-provider abstraction — routed India→Razorpay, else→Stripe Connect — recording a `Payout` and debiting the ledger so the balance reflects the withdrawal.

**Architecture:** `PaymentProvider` abstract token (like `GoogleVerifier`) with `StripeProvider` / `RazorpayProvider` impls; `PaymentRouter.forCountry()` picks one. `PayoutService.requestPayout(accountId)` reads the earnings balance, enforces a minimum, calls `provider.payout`, writes a `Payout` row, and posts a balanced ledger debit via `LedgerService.recordPayout`. Real Stripe/Razorpay SDK calls live behind the provider impls (configured-or-throw stubs for now); the router, service, ledger, and endpoint are fully tested with fakes (e2e overrides the router).

**Tech Stack:** Same. Amounts in paise. **Collect (advertiser money-in) is defined in the interface but wired in Plan 07** (advertisers/portal don't exist yet).

> **Prerequisites:** Plans 01–05 merged. `docker compose up -d`. `packages/shared` built.

> **Known follow-ups (noted, not in scope):** real Stripe/Razorpay SDK integration + KYC/onboarding; a pending-payout lock to prevent double-withdraw under concurrency; advertiser collect flow (Plan 07).

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §9.

---

## File Structure

```
apps/api/
  prisma/schema.prisma                       # + Payout model, Account.payouts (MODIFY)
  src/payments/constants.ts                  # payoutMinPaise (env-overridable)
  src/payments/payment-provider.ts           # abstract + request/result types
  src/payments/stripe.provider.ts            # stub impl
  src/payments/razorpay.provider.ts          # stub impl
  src/payments/payment-router.ts             + payment-router.spec.ts
  src/payments/payout.service.ts             + payout.service.spec.ts
  src/payments/payouts.controller.ts         # POST /payouts, GET /payouts/me (AuthGuard)
  src/payments/payments.module.ts
  src/payments/payouts.e2e-spec.ts
  src/ledger/ledger.service.ts               # + recordPayout (MODIFY)
  src/ledger/ledger.service.spec.ts          # + recordPayout tests (MODIFY)
  src/app.module.ts                          # + PaymentsModule (MODIFY)
```

---

## Task 1: Prisma — `Payout`

- [ ] **Step 1: Append to `apps/api/prisma/schema.prisma`**

```prisma
model Payout {
  id          String   @id @default(cuid())
  account     Account  @relation(fields: [accountId], references: [id])
  accountId   String
  provider    String   // stripe | razorpay
  amountPaise Int
  currency    String   @default("INR")
  status      String   // paid | pending | failed
  providerRef String?
  createdAt   DateTime @default(now())

  @@index([accountId])
}
```

- [ ] **Step 2: Add `payouts Payout[]` to the `Account` model** (inside the model, e.g. after `events AdEvent[]`)

```prisma
  payouts   Payout[]
```

- [ ] **Step 3: Apply + regenerate**

```bash
pnpm --filter @vibearning/api exec prisma db push
pnpm --filter @vibearning/api exec prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma
git commit -m "feat(api): add Payout model"
```

---

## Task 2: Provider abstraction + router (TDD)

**Files:** Create `src/payments/{constants.ts,payment-provider.ts,stripe.provider.ts,razorpay.provider.ts,payment-router.ts}`; Test `payment-router.spec.ts`

- [ ] **Step 1: `src/payments/constants.ts`**

```ts
// Minimum payout in paise (₹100 default). Env-overridable.
export const payoutMinPaise = () => Number(process.env.PAYOUT_MIN_PAISE ?? 10000);
```

- [ ] **Step 2: `src/payments/payment-provider.ts`**

```ts
export interface PayoutRequest { payeeRef: string; amountPaise: number; currency: string; method?: string }
export interface PayoutResult { providerRef: string; status: "paid" | "pending" | "failed" }
export interface CollectRequest { amountPaise: number; currency: string; description?: string }
export interface CollectResult { providerRef: string; status: string; checkoutUrl?: string }

/** Abstract DI token; impls wrap a real PSP SDK. */
export abstract class PaymentProvider {
  abstract readonly name: string; // "stripe" | "razorpay"
  abstract payout(req: PayoutRequest): Promise<PayoutResult>;
  abstract collect(req: CollectRequest): Promise<CollectResult>; // wired in Plan 07
}
```

- [ ] **Step 3: `src/payments/stripe.provider.ts`** (stub — real SDK is a follow-up)

```ts
import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

@Injectable()
export class StripeProvider extends PaymentProvider {
  readonly name = "stripe";
  async payout(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error("StripeProvider.payout not configured — implement Stripe Connect transfer (set STRIPE_SECRET_KEY)");
  }
  async collect(_req: CollectRequest): Promise<CollectResult> {
    throw new Error("StripeProvider.collect not configured");
  }
}
```

- [ ] **Step 4: `src/payments/razorpay.provider.ts`** (stub)

```ts
import { Injectable } from "@nestjs/common";
import { PaymentProvider, PayoutRequest, PayoutResult, CollectRequest, CollectResult } from "./payment-provider";

@Injectable()
export class RazorpayProvider extends PaymentProvider {
  readonly name = "razorpay";
  async payout(_req: PayoutRequest): Promise<PayoutResult> {
    throw new Error("RazorpayProvider.payout not configured — implement RazorpayX payout (set RAZORPAYX_KEY)");
  }
  async collect(_req: CollectRequest): Promise<CollectResult> {
    throw new Error("RazorpayProvider.collect not configured");
  }
}
```

- [ ] **Step 5: Write the failing test — `src/payments/payment-router.spec.ts`**

```ts
import { PaymentRouter } from "./payment-router";

const stripe = { name: "stripe" } as any;
const razorpay = { name: "razorpay" } as any;

describe("PaymentRouter", () => {
  const router = new PaymentRouter(stripe, razorpay);
  it("routes India to Razorpay", () => {
    expect(router.forCountry("IN").name).toBe("razorpay");
  });
  it("routes other countries to Stripe", () => {
    expect(router.forCountry("US").name).toBe("stripe");
  });
  it("defaults unknown/null country to Stripe", () => {
    expect(router.forCountry(null).name).toBe("stripe");
  });
});
```

- [ ] **Step 6: Run to verify fail** — `pnpm --filter @vibearning/api test -- payment-router` → FAIL

- [ ] **Step 7: Implement `src/payments/payment-router.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { PaymentProvider } from "./payment-provider";
import { StripeProvider } from "./stripe.provider";
import { RazorpayProvider } from "./razorpay.provider";

@Injectable()
export class PaymentRouter {
  constructor(
    private readonly stripe: StripeProvider,
    private readonly razorpay: RazorpayProvider,
  ) {}

  forCountry(country: string | null): PaymentProvider {
    return country === "IN" ? this.razorpay : this.stripe;
  }
}
```

- [ ] **Step 8: Run to verify pass** — `pnpm --filter @vibearning/api test -- payment-router` → PASS (3)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/payments/constants.ts apps/api/src/payments/payment-provider.ts apps/api/src/payments/stripe.provider.ts apps/api/src/payments/razorpay.provider.ts apps/api/src/payments/payment-router.ts apps/api/src/payments/payment-router.spec.ts
git commit -m "feat(api): PaymentProvider abstraction + country router (stripe/razorpay)"
```

---

## Task 3: `LedgerService.recordPayout` (TDD)

**Files:** Modify `src/ledger/ledger.service.ts`, `ledger.service.spec.ts`

- [ ] **Step 1: Add the failing tests — append to `ledger.service.spec.ts` describe block**

```ts
  it("recordPayout posts a balanced debit(earnings)/credit(payouts) pair", async () => {
    await svc.recordPayout("pay1", "acc1", 15000);
    const arg = prismaMock.ledgerEntry.createMany.mock.calls[0][0].data as Array<{ account: string; direction: string; amount: number }>;
    expect(arg).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventId: "pay1", account: "earnings:dev:acc1", direction: "debit", amount: 15000 }),
      expect.objectContaining({ eventId: "pay1", account: "payouts:cleared:acc1", direction: "credit", amount: 15000 }),
    ]));
  });

  it("recordPayout is idempotent", async () => {
    prismaMock.ledgerEntry.count.mockResolvedValue(2);
    await svc.recordPayout("pay1", "acc1", 15000);
    expect(prismaMock.ledgerEntry.createMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @vibearning/api test -- ledger.service` → FAIL (recordPayout not a function)

- [ ] **Step 3: Add `recordPayout` to `src/ledger/ledger.service.ts`** (new method)

```ts
  async recordPayout(payoutId: string, accountId: string, amountPaise: number): Promise<void> {
    if (amountPaise <= 0) return;
    const already = await this.prisma.ledgerEntry.count({ where: { eventId: payoutId } });
    if (already > 0) return;
    await this.prisma.ledgerEntry.createMany({
      data: [
        { eventId: payoutId, account: `earnings:dev:${accountId}`, direction: "debit", amount: amountPaise },
        { eventId: payoutId, account: `payouts:cleared:${accountId}`, direction: "credit", amount: amountPaise },
      ],
      skipDuplicates: true,
    });
  }
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @vibearning/api test -- ledger.service` → PASS (9)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ledger/ledger.service.ts apps/api/src/ledger/ledger.service.spec.ts
git commit -m "feat(api): LedgerService.recordPayout (debit earnings on withdrawal)"
```

---

## Task 4: `PayoutService` (TDD)

**Files:** Create `src/payments/payout.service.ts`, `payout.service.spec.ts`

- [ ] **Step 1: Write the failing test — `src/payments/payout.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { PayoutService } from "./payout.service";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";

const prismaMock = { account: { findUnique: jest.fn() }, payout: { create: jest.fn() } };
const ledgerMock = { earningsBalance: jest.fn(), recordPayout: jest.fn() };
const provider = { name: "razorpay", payout: jest.fn(), collect: jest.fn() };
const routerMock = { forCountry: jest.fn().mockReturnValue(provider) };

describe("PayoutService", () => {
  let svc: PayoutService;
  beforeEach(async () => {
    jest.resetAllMocks();
    routerMock.forCountry.mockReturnValue(provider);
    prismaMock.account.findUnique.mockResolvedValue({ id: "acc1", country: "IN" });
    prismaMock.payout.create.mockImplementation(async (a: { data: Record<string, unknown> }) => ({ id: "pay1", ...a.data }));
    process.env.PAYOUT_MIN_PAISE = "10000";
    const mod = await Test.createTestingModule({
      providers: [
        PayoutService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LedgerService, useValue: ledgerMock },
        { provide: PaymentRouter, useValue: routerMock },
      ],
    }).compile();
    svc = mod.get(PayoutService);
  });

  it("rejects a payout below the minimum threshold", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(5000);
    await expect(svc.requestPayout("acc1")).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.payout).not.toHaveBeenCalled();
  });

  it("pays out the full balance, records the payout, and debits the ledger", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(15000);
    provider.payout.mockResolvedValue({ providerRef: "rzp_1", status: "paid" });
    const payout = await svc.requestPayout("acc1");
    expect(routerMock.forCountry).toHaveBeenCalledWith("IN");
    expect(provider.payout).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 15000, currency: "INR" }));
    expect(prismaMock.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: "acc1", provider: "razorpay", amountPaise: 15000, status: "paid" }) }),
    );
    expect(ledgerMock.recordPayout).toHaveBeenCalledWith("pay1", "acc1", 15000);
    expect(payout).toMatchObject({ id: "pay1", status: "paid" });
  });

  it("records a failed payout without debiting the ledger", async () => {
    ledgerMock.earningsBalance.mockResolvedValue(15000);
    provider.payout.mockResolvedValue({ providerRef: "rzp_2", status: "failed" });
    await svc.requestPayout("acc1");
    expect(prismaMock.payout.create).toHaveBeenCalled();
    expect(ledgerMock.recordPayout).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @vibearning/api test -- payout.service` → FAIL

- [ ] **Step 3: Implement `src/payments/payout.service.ts`**

```ts
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { PaymentRouter } from "./payment-router";
import { payoutMinPaise } from "./constants";

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly router: PaymentRouter,
  ) {}

  async requestPayout(accountId: string) {
    const balance = await this.ledger.earningsBalance(accountId);
    if (balance < payoutMinPaise()) {
      throw new BadRequestException(`balance_below_threshold:${balance}`);
    }

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    const provider = this.router.forCountry(account?.country ?? null);
    const result = await provider.payout({ payeeRef: accountId, amountPaise: balance, currency: "INR" });

    const payout = await this.prisma.payout.create({
      data: {
        accountId, provider: provider.name, amountPaise: balance, currency: "INR",
        status: result.status, providerRef: result.providerRef,
      },
    });

    if (result.status !== "failed") {
      await this.ledger.recordPayout(payout.id, accountId, balance);
    }
    return payout;
  }
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @vibearning/api test -- payout.service` → PASS (3)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payout.service.ts apps/api/src/payments/payout.service.spec.ts
git commit -m "feat(api): PayoutService (threshold + route + payout + ledger debit)"
```

---

## Task 5: Controller + module + e2e

**Files:** Create `src/payments/payouts.controller.ts`, `payments.module.ts`, `payouts.e2e-spec.ts`; Modify `src/app.module.ts`

- [ ] **Step 1: `src/payments/payouts.controller.ts`**

```ts
import { Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutService } from "./payout.service";

@Controller("payouts")
@UseGuards(AuthGuard)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async request(@Req() req: { account: { id: string } }) {
    return this.payouts.requestPayout(req.account.id);
  }

  @Get("me")
  async mine(@Req() req: { account: { id: string } }) {
    return this.prisma.payout.findMany({ where: { accountId: req.account.id }, orderBy: { createdAt: "desc" } });
  }
}
```

- [ ] **Step 2: `src/payments/payments.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LedgerModule } from "../ledger/ledger.module";
import { StripeProvider } from "./stripe.provider";
import { RazorpayProvider } from "./razorpay.provider";
import { PaymentRouter } from "./payment-router";
import { PayoutService } from "./payout.service";
import { PayoutsController } from "./payouts.controller";

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PayoutsController],
  providers: [StripeProvider, RazorpayProvider, PaymentRouter, PayoutService],
})
export class PaymentsModule {}
```

- [ ] **Step 3: Register `PaymentsModule` in `app.module.ts`** (add import + to `imports`)

- [ ] **Step 4: Write the e2e — `src/payments/payouts.e2e-spec.ts`** (override the router with a fake provider)

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { GoogleVerifier } from "../auth/google-verifier";
import { PaymentRouter } from "./payment-router";
import { PrismaService } from "../prisma/prisma.service";

describe("/payouts (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let accountId: string;

  beforeAll(async () => {
    const fakeProvider = { name: "razorpay", payout: async () => ({ providerRef: "rzp_e2e", status: "paid" }), collect: async () => ({ providerRef: "x", status: "paid" }) };
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleVerifier).useValue({ verify: async () => ({ sub: "g-pay", email: "pay@x.com" }) })
      .overrideProvider(PaymentRouter).useValue({ forCountry: () => fakeProvider })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer()).post("/auth/google").send({ idToken: "x".repeat(20) });
    token = login.body.token;
    accountId = login.body.account.id;

    // Reset prior-run state and seed an earnings balance of 15000 paise.
    await prisma.payout.deleteMany({ where: { accountId } });
    await prisma.ledgerEntry.deleteMany({ where: { account: { in: [`earnings:dev:${accountId}`, `payouts:cleared:${accountId}`] } } });
    await prisma.ledgerEntry.create({ data: { eventId: `seed_${accountId}`, account: `earnings:dev:${accountId}`, direction: "credit", amount: 15000 } });
  });
  afterAll(async () => { await app.close(); });

  it("pays out the balance and zeroes earnings", async () => {
    const res = await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${token}`).expect(201);
    expect(res.body).toMatchObject({ amountPaise: 15000, status: "paid", provider: "razorpay" });

    const bal = await request(app.getHttpServer()).get("/ledger/me/balance").set("authorization", `Bearer ${token}`).expect(200);
    expect(bal.body.balancePaise).toBe(0);
  });

  it("rejects a second payout when the balance is now below threshold", async () => {
    await request(app.getHttpServer()).post("/payouts").set("authorization", `Bearer ${token}`).expect(400);
  });

  it("requires auth", async () => {
    await request(app.getHttpServer()).post("/payouts").expect(401);
  });
});
```

- [ ] **Step 5: Run the FULL api suite** — `pnpm --filter @vibearning/api test`
Expected: all suites green (Plans 01–05 + payment-router, payout.service, payouts.e2e, ledger recordPayout).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments/payouts.controller.ts apps/api/src/payments/payments.module.ts apps/api/src/payments/payouts.e2e-spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): POST /payouts + GET /payouts/me + payouts e2e"
```

---

## Done criteria for Plan 06

- [ ] Router sends India→Razorpay, else→Stripe.
- [ ] `POST /payouts` pays the full earnings balance via the routed provider, records a `Payout`, debits the ledger → balance 0; below-threshold → 400; unauth → 401.
- [ ] Failed provider payout records a `Payout(status=failed)` without debiting.
- [ ] Full api suite green.

**Next plan:** `07 — Portal + Billing` (Next.js advertiser dashboard: advertiser auth, create campaign, buy blocks via `PaymentProvider.collect` → escrow funded; the demand side).
