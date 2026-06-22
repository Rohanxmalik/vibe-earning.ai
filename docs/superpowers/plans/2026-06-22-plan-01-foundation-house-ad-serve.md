# Plan 01 — Monorepo Foundation + House-Ad Serve — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Turborepo TypeScript monorepo and a NestJS API that serves one ranked house ad from `GET /serve?surface=...`, backed by Postgres (campaigns/creatives) and Redis (per-surface ranking), all built test-first.

**Architecture:** pnpm workspace + Turborepo. `apps/api` (NestJS, Jest) exposes `/health` and `/serve`. `packages/shared` (vitest) holds zod DTOs + the `Surface` enum shared across apps. Postgres via Prisma; Redis via ioredis (sorted set per surface, score = bid). Local infra via docker-compose.

**Tech Stack:** TypeScript, pnpm, Turborepo, NestJS, Prisma + PostgreSQL, ioredis + Redis, zod, Jest (api), vitest (packages), docker-compose.

> **Test-runner note (deliberate):** `apps/api` uses **Jest** (NestJS default — zero-friction, bulletproof). `packages/*` and (later) `apps/extension` use **vitest**. Mixed runners per package is normal; the ≥80% coverage rule applies to both.

> **This is Plan 01 of ~9** (see `docs/superpowers/plans/` index / the spec phasing). It produces a working, curl-testable API skeleton with no money and no real auth yet.

**Spec:** [2026-06-22-kickbacks-india-ad-marketplace-design.md](../specs/2026-06-22-kickbacks-india-ad-marketplace-design.md)

---

## File Structure (created by this plan)

```
package.json                      # workspace root, scripts
pnpm-workspace.yaml               # workspace globs
turbo.json                        # task pipeline
tsconfig.base.json                # shared TS config
.nvmrc                            # node version
.env.example                      # documented env vars
docker-compose.yml                # postgres + redis

packages/shared/
  package.json
  tsconfig.json
  vitest.config.ts
  src/index.ts                    # re-exports
  src/surfaces.ts                 # Surface enum + zod schema
  src/dtos.ts                     # ServeResponse / ServeQuery zod schemas
  src/surfaces.test.ts

apps/api/
  package.json
  tsconfig.json
  tsconfig.build.json
  nest-cli.json
  jest.config.js
  prisma/schema.prisma
  src/main.ts                     # bootstrap
  src/app.module.ts
  src/health/health.controller.ts
  src/health/health.controller.spec.ts
  src/prisma/prisma.service.ts
  src/prisma/prisma.module.ts
  src/redis/redis.service.ts
  src/redis/redis.module.ts
  src/ranking/ranking.service.ts
  src/ranking/ranking.service.spec.ts
  src/serve/serve.controller.ts
  src/serve/serve.service.ts
  src/serve/serve.service.spec.ts
  src/serve/serve.e2e-spec.ts
  src/admin/admin.controller.ts   # create house ad (admin-key guarded)
  src/admin/admin.controller.spec.ts
  test/seed-house-ad.ts           # dev helper
```

Each file has one responsibility. Modules (`prisma`, `redis`, `ranking`, `serve`, `admin`) map to the spec's module decomposition.

---

## Task 0: Workspace tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`

- [ ] **Step 1: Create `.nvmrc`**

```
22
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create root `package.json`**

```json
{
  "name": "kickbacks-india",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: Install and commit**

Run: `pnpm install`
Expected: lockfile created, no errors.

```bash
git add .nvmrc pnpm-workspace.yaml package.json turbo.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo workspace"
```

---

## Task 1: Local infra (Postgres + Redis)

**Files:**
- Create: `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: kbi
      POSTGRES_PASSWORD: kbi
      POSTGRES_DB: kbi
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL=postgresql://kbi:kbi@localhost:5432/kbi?schema=public
REDIS_URL=redis://localhost:6379
ADMIN_API_KEY=dev-admin-key-change-me
PORT=3000
```

- [ ] **Step 3: Bring infra up and verify**

Run: `docker compose up -d && docker compose ps`
Expected: both `postgres` and `redis` show `running`/healthy.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add postgres + redis docker-compose and env template"
```

---

## Task 2: `packages/shared` — Surface enum + DTOs (TDD)

**Files:**
- Create: `packages/shared/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/surfaces.ts`, `src/dtos.ts`, `src/index.ts`
- Test: `packages/shared/src/surfaces.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@kbi/shared",
  "version": "0.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "zod": "^3.23.0" },
  "devDependencies": { "vitest": "^2.1.0", "typescript": "^5.6.0" }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Write the failing test — `src/surfaces.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { SURFACES, surfaceSchema } from "./surfaces";

describe("surfaces", () => {
  it("includes the three launch surfaces", () => {
    expect(SURFACES).toEqual([
      "claude-code-panel",
      "claude-code-terminal",
      "codex-panel",
      "gemini-cli-terminal",
    ]);
  });

  it("accepts a valid surface and rejects junk", () => {
    expect(surfaceSchema.safeParse("codex-panel").success).toBe(true);
    expect(surfaceSchema.safeParse("cursor").success).toBe(false);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @kbi/shared test`
Expected: FAIL — cannot find module `./surfaces`.

- [ ] **Step 6: Implement `src/surfaces.ts`**

```ts
import { z } from "zod";

export const SURFACES = [
  "claude-code-panel",
  "claude-code-terminal",
  "codex-panel",
  "gemini-cli-terminal",
] as const;

export type Surface = (typeof SURFACES)[number];

export const surfaceSchema = z.enum(SURFACES);
```

- [ ] **Step 7: Implement `src/dtos.ts`**

```ts
import { z } from "zod";
import { surfaceSchema } from "./surfaces";

export const serveQuerySchema = z.object({
  surface: surfaceSchema,
  installId: z.string().min(1).optional(),
});
export type ServeQuery = z.infer<typeof serveQuerySchema>;

export const serveResponseSchema = z.object({
  adId: z.string(),
  campaignId: z.string(),
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().nullable(),
  isHouseAd: z.boolean(),
});
export type ServeResponse = z.infer<typeof serveResponseSchema>;
```

- [ ] **Step 8: Implement `src/index.ts`**

```ts
export * from "./surfaces";
export * from "./dtos";
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @kbi/shared test`
Expected: PASS (2 tests).

- [ ] **Step 10: Build the package (needed by api)**

Run: `pnpm --filter @kbi/shared build`
Expected: `dist/` emitted, no type errors.

- [ ] **Step 11: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Surface enum and serve DTOs"
```

---

## Task 3: `apps/api` NestJS skeleton + `/health` (TDD)

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `jest.config.js`, `src/main.ts`, `src/app.module.ts`, `src/health/health.controller.ts`
- Test: `apps/api/src/health/health.controller.spec.ts`

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "@kbi/api",
  "version": "0.0.0",
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "test": "jest",
    "lint": "tsc -p tsconfig.json --noEmit",
    "prisma:migrate": "prisma migrate dev",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@kbi/shared": "workspace:*",
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@prisma/client": "^5.20.0",
    "dotenv": "^16.4.0",
    "ioredis": "^5.4.0",
    "reflect-metadata": "^0.2.0",
    "rxjs": "^7.8.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.0",
    "@nestjs/testing": "^10.4.0",
    "@types/jest": "^29.5.0",
    "@types/node": "^22.0.0",
    "@types/supertest": "^6.0.0",
    "jest": "^29.7.0",
    "prisma": "^5.20.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "outDir": "dist",
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "baseUrl": "."
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.build.json`**

```json
{ "extends": "./tsconfig.json", "exclude": ["**/*.spec.ts", "test", "dist"] }
```

- [ ] **Step 4: Create `apps/api/nest-cli.json`**

```json
{ "$schema": "https://json.schemastore.org/nest-cli", "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

- [ ] **Step 5: Create `apps/api/jest.config.js`**

> `setupFiles: ["dotenv/config"]` loads `apps/api/.env` into `process.env` before any test (Prisma/Redis need it). `@kbi/shared` maps to the **built** `dist` — so `packages/shared` must be built first (done in Task 2 Step 10; at the repo level `turbo` enforces `^build` before `test`).

```js
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  moduleNameMapper: { "^@kbi/shared$": "<rootDir>/../../../packages/shared/dist/index.js" },
};
```

- [ ] **Step 6: Install**

Run: `pnpm install`
Expected: api deps resolve, `@kbi/shared` linked via workspace.

- [ ] **Step 7: Write the failing test — `src/health/health.controller.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns ok", async () => {
    const mod = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const ctrl = mod.get(HealthController);
    expect(ctrl.check()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @kbi/api test`
Expected: FAIL — cannot find `./health.controller`.

- [ ] **Step 9: Implement `src/health/health.controller.ts`**

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}
```

- [ ] **Step 10: Implement `src/app.module.ts`**

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";

@Module({ controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 11: Implement `src/main.ts`**

> `dotenv/config` is imported first so `process.env` is populated before Prisma/Redis construct.

```ts
import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @kbi/api test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/api
git commit -m "feat(api): nestjs skeleton with health endpoint"
```

---

## Task 4: Prisma schema + migration (campaigns, creatives, bids)

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`

- [ ] **Step 1: Create `apps/api/prisma/schema.prisma`**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Campaign {
  id        String   @id @default(cuid())
  copy      String   // <= 60 chars (validated in app layer)
  url       String
  iconUrl   String?
  isHouseAd Boolean  @default(false)
  status    String   @default("active") // active | paused
  bids      Bid[]
  createdAt DateTime @default(now())
}

model Bid {
  id         String   @id @default(cuid())
  campaign   Campaign @relation(fields: [campaignId], references: [id])
  campaignId String
  surface    String
  amount     Int      // minor units (paise); house ads = 0
  status     String   @default("active")
  createdAt  DateTime @default(now())
  @@index([surface, status])
}
```

- [ ] **Step 2: Generate client + run migration**

> Prisma CLI and the dotenv setup both read `apps/api/.env` (Prisma loads `.env` from its cwd; tests/runtime load it via `dotenv/config`). Create it from the root template.

Run (from repo root): `cp .env.example apps/api/.env`
Then: `pnpm --filter @kbi/api prisma:migrate -- --name init`
Expected: migration `init` applied; `@prisma/client` generated. (`apps/api/.env` is git-ignored by the root `.gitignore`.)

- [ ] **Step 3: Implement `src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

- [ ] **Step 4: Implement `src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

- [ ] **Step 5: Register PrismaModule in `app.module.ts`**

Modify `src/app.module.ts` imports array to include `PrismaModule`.

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({ imports: [PrismaModule], controllers: [HealthController] })
export class AppModule {}
```

- [ ] **Step 6: Verify build**

Run: `pnpm --filter @kbi/api build`
Expected: compiles, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts
git commit -m "feat(api): prisma schema (campaign/bid) + prisma module"
```

---

## Task 5: Redis ranking service (TDD)

**Files:**
- Create: `src/redis/redis.service.ts`, `src/redis/redis.module.ts`, `src/ranking/ranking.service.ts`
- Test: `src/ranking/ranking.service.spec.ts`

- [ ] **Step 1: Implement `src/redis/redis.service.ts`**

```ts
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() { super(process.env.REDIS_URL ?? "redis://localhost:6379"); }
  async onModuleDestroy() { await this.quit(); }
}
```

- [ ] **Step 2: Implement `src/redis/redis.module.ts`**

```ts
import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
```

- [ ] **Step 3: Write the failing test — `src/ranking/ranking.service.spec.ts`**

> Uses the real Redis from docker-compose (ensure `docker compose up -d`). Keys are flushed per test.

```ts
import { Test } from "@nestjs/testing";
import { RankingService } from "./ranking.service";
import { RedisService } from "../redis/redis.service";

describe("RankingService", () => {
  let ranking: RankingService;
  let redis: RedisService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [RankingService, RedisService],
    }).compile();
    ranking = mod.get(RankingService);
    redis = mod.get(RedisService);
  });
  beforeEach(async () => { await redis.flushall(); });
  afterAll(async () => { await redis.quit(); });

  it("returns the highest bid first for a surface", async () => {
    await ranking.upsertBid("codex-panel", "campA", 100);
    await ranking.upsertBid("codex-panel", "campB", 500);
    expect(await ranking.topCampaign("codex-panel")).toBe("campB");
  });

  it("returns null when surface empty", async () => {
    expect(await ranking.topCampaign("codex-panel")).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @kbi/api test -- ranking`
Expected: FAIL — cannot find `./ranking.service`.

- [ ] **Step 5: Implement `src/ranking/ranking.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const key = (surface: string) => `rank:${surface}`;

@Injectable()
export class RankingService {
  constructor(private readonly redis: RedisService) {}

  async upsertBid(surface: string, campaignId: string, amount: number): Promise<void> {
    await this.redis.zadd(key(surface), amount, campaignId);
  }

  async topCampaign(surface: string): Promise<string | null> {
    const res = await this.redis.zrevrange(key(surface), 0, 0);
    return res.length ? res[0] : null;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @kbi/api test -- ranking`
Expected: PASS (2 tests).

- [ ] **Step 7: Create `src/ranking/ranking.module.ts`** (global → `/serve`, admin, and the e2e test all share one instance; avoids duplicate providers + makes `app.get(RankingService)` resolvable)

```ts
import { Global, Module } from "@nestjs/common";
import { RankingService } from "./ranking.service";

@Global()
@Module({ providers: [RankingService], exports: [RankingService] })
export class RankingModule {}
```

- [ ] **Step 8: Register `RedisModule` and `RankingModule` in `app.module.ts`** (add both to `imports`), then commit

```bash
git add apps/api/src/redis apps/api/src/ranking apps/api/src/app.module.ts
git commit -m "feat(api): redis ranking service (sorted set per surface)"
```

---

## Task 6: Serve module — `GET /serve` (TDD, unit + e2e)

**Files:**
- Create: `src/serve/serve.service.ts`, `src/serve/serve.controller.ts`, `src/serve/serve.module.ts`
- Test: `src/serve/serve.service.spec.ts`, `src/serve/serve.e2e-spec.ts`

- [ ] **Step 1: Write the failing unit test — `src/serve/serve.service.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { ServeService } from "./serve.service";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";

const prismaMock = { campaign: { findUnique: jest.fn() } };
const rankingMock = { topCampaign: jest.fn() };

describe("ServeService", () => {
  let service: ServeService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ServeService,
        { provide: RankingService, useValue: rankingMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = mod.get(ServeService);
  });

  it("returns the top-ranked campaign creative", async () => {
    rankingMock.topCampaign.mockResolvedValue("campB");
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: "campB", copy: "Ship faster with Acme", url: "https://acme.dev",
      iconUrl: null, isHouseAd: false, status: "active",
    });
    const ad = await service.pickAd("codex-panel");
    expect(ad).toMatchObject({ campaignId: "campB", copy: "Ship faster with Acme", isHouseAd: false });
  });

  it("returns null when nothing ranked", async () => {
    rankingMock.topCampaign.mockResolvedValue(null);
    expect(await service.pickAd("codex-panel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kbi/api test -- serve.service`
Expected: FAIL — cannot find `./serve.service`.

- [ ] **Step 3: Implement `src/serve/serve.service.ts`**

```ts
import { Injectable } from "@nestjs/common";
import type { ServeResponse } from "@kbi/shared";
import { RankingService } from "../ranking/ranking.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ServeService {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
  ) {}

  async pickAd(surface: string): Promise<ServeResponse | null> {
    const campaignId = await this.ranking.topCampaign(surface);
    if (!campaignId) return null;
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c || c.status !== "active") return null;
    return {
      adId: c.id,
      campaignId: c.id,
      copy: c.copy,
      url: c.url,
      iconUrl: c.iconUrl,
      isHouseAd: c.isHouseAd,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @kbi/api test -- serve.service`
Expected: PASS.

- [ ] **Step 5: Implement `src/serve/serve.controller.ts`**

```ts
import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { serveQuerySchema } from "@kbi/shared";
import { ServeService } from "./serve.service";

@Controller("serve")
export class ServeController {
  constructor(private readonly serve: ServeService) {}

  @Get()
  async serve(@Query() raw: unknown) {
    const parsed = serveQuerySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const ad = await this.serve.pickAd(parsed.data.surface);
    return { ad }; // ad is null when no inventory — extension renders nothing
  }
}
```

- [ ] **Step 6: Implement `src/serve/serve.module.ts`** and register in `app.module.ts`

```ts
import { Module } from "@nestjs/common";
import { ServeController } from "./serve.controller";
import { ServeService } from "./serve.service";

// RankingService comes from the global RankingModule.
@Module({ controllers: [ServeController], providers: [ServeService] })
export class ServeModule {}
```

- [ ] **Step 7: Write the e2e test — `src/serve/serve.e2e-spec.ts`**

> Requires docker-compose infra up + migration applied. Seeds a house ad directly via Prisma + ranking, then hits the HTTP route.

```ts
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";
import { RedisService } from "../redis/redis.service";

describe("/serve (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    const ranking = app.get(RankingService);

    await redis.flushall();
    await prisma.bid.deleteMany();
    await prisma.campaign.deleteMany();
    const house = await prisma.campaign.create({
      data: { copy: "Powered by Kickbacks-India", url: "https://kbi.example", isHouseAd: true },
    });
    await ranking.upsertBid("codex-panel", house.id, 0);
  });

  afterAll(async () => { await app.close(); });

  it("serves the house ad for a valid surface", async () => {
    const res = await request(app.getHttpServer()).get("/serve?surface=codex-panel").expect(200);
    expect(res.body.ad).toMatchObject({ copy: "Powered by Kickbacks-India", isHouseAd: true });
  });

  it("400s on an invalid surface", async () => {
    await request(app.getHttpServer()).get("/serve?surface=cursor").expect(400);
  });
});
```

- [ ] **Step 8: Run e2e to verify pass**

Run: `pnpm --filter @kbi/api test -- serve.e2e`
Expected: PASS (2 tests). If it fails on connection, confirm `docker compose up -d` and `.env` present.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/serve apps/api/src/app.module.ts
git commit -m "feat(api): GET /serve returns top-ranked house ad"
```

---

## Task 7: Admin endpoint to create a house ad (admin-key guarded, TDD)

**Files:**
- Create: `src/admin/admin.controller.ts`, `src/admin/admin.module.ts`
- Test: `src/admin/admin.controller.spec.ts`

- [ ] **Step 1: Write the failing test — `src/admin/admin.controller.spec.ts`**

```ts
import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const prismaMock = { campaign: { create: jest.fn() } };
const rankingMock = { upsertBid: jest.fn() };

describe("AdminController", () => {
  let ctrl: AdminController;
  beforeEach(async () => {
    jest.resetAllMocks();
    process.env.ADMIN_API_KEY = "test-key";
    const mod = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingService, useValue: rankingMock },
      ],
    }).compile();
    ctrl = mod.get(AdminController);
  });

  it("rejects a wrong admin key", async () => {
    await expect(
      ctrl.createHouseAd("nope", { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("creates a house ad and ranks it at 0", async () => {
    prismaMock.campaign.create.mockResolvedValue({ id: "c1" });
    await ctrl.createHouseAd("test-key", { copy: "Hi there", url: "https://x.dev", surface: "codex-panel" });
    expect(prismaMock.campaign.create).toHaveBeenCalled();
    expect(rankingMock.upsertBid).toHaveBeenCalledWith("codex-panel", "c1", 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @kbi/api test -- admin`
Expected: FAIL — cannot find `./admin.controller`.

- [ ] **Step 3: Implement `src/admin/admin.controller.ts`**

```ts
import { Body, Controller, Headers, Post, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { surfaceSchema } from "@kbi/shared";
import { PrismaService } from "../prisma/prisma.service";
import { RankingService } from "../ranking/ranking.service";

const bodySchema = z.object({
  copy: z.string().min(3).max(60),
  url: z.string().url(),
  iconUrl: z.string().url().optional(),
  surface: surfaceSchema,
});
type Body = z.infer<typeof bodySchema>;

@Controller("admin/house-ads")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  @Post()
  async createHouseAd(@Headers("x-admin-key") key: string, @Body() raw: unknown) {
    if (!key || key !== process.env.ADMIN_API_KEY) throw new UnauthorizedException();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const b: Body = parsed.data;
    const c = await this.prisma.campaign.create({
      data: { copy: b.copy, url: b.url, iconUrl: b.iconUrl ?? null, isHouseAd: true },
    });
    await this.ranking.upsertBid(b.surface, c.id, 0);
    return { id: c.id };
  }
}
```

- [ ] **Step 4: Implement `src/admin/admin.module.ts`** and register in `app.module.ts`

```ts
import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";

// PrismaService + RankingService come from their global modules.
@Module({ controllers: [AdminController] })
export class AdminModule {}
```

Then set the **final** `src/app.module.ts` (assembles every module added across Tasks 4–7):

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RankingModule } from "./ranking/ranking.module";
import { ServeModule } from "./serve/serve.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [PrismaModule, RedisModule, RankingModule, ServeModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @kbi/api test -- admin`
Expected: PASS (2 tests).

- [ ] **Step 6: Manual smoke test (optional but recommended)**

Run (api in another terminal: `pnpm --filter @kbi/api dev`):
```bash
curl -X POST localhost:3000/admin/house-ads \
  -H "x-admin-key: dev-admin-key-change-me" -H "content-type: application/json" \
  -d '{"copy":"Built in India 🇮🇳","url":"https://kbi.example","surface":"claude-code-terminal"}'
curl "localhost:3000/serve?surface=claude-code-terminal"
```
Expected: POST returns `{"id":"..."}`; GET returns that ad.

- [ ] **Step 7: Run the full suite + commit**

Run: `pnpm --filter @kbi/api test && pnpm --filter @kbi/shared test`
Expected: all green.

```bash
git add apps/api/src/admin apps/api/src/app.module.ts
git commit -m "feat(api): admin endpoint to create + rank house ads"
```

---

## Done criteria for Plan 01

- [ ] `docker compose up -d` brings up PG + Redis.
- [ ] `pnpm install && pnpm --filter @kbi/shared build` succeeds.
- [ ] `pnpm test` (turbo) runs shared (vitest) + api (jest) suites green.
- [ ] Admin can POST a house ad; `GET /serve?surface=...` returns the top-ranked ad; invalid surface → 400; empty inventory → `{ "ad": null }`.

**Next plan:** `02 — Metrics + view validation` (idempotent `/events`, 5s-view rules, frequency caps; introduces the impression record the ledger later consumes).
