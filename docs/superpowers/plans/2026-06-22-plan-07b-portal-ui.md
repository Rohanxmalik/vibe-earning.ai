# Plan 07b — Next.js advertiser portal UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** A minimal Next.js advertiser dashboard (`apps/portal`) over the Plan 07 API: register/login, list + create campaigns, buy blocks. The API-call logic is unit-tested; pages are thin client components verified by typecheck + build.

**Architecture:** Next.js App Router. A **pure `PortalApi` client** (`lib/api.ts`, vitest-tested with injected `fetch`) wraps the `/advertiser/*` endpoints. `lib/token.ts` stores the JWT in `localStorage` (browser-guarded). Pages (`/login`, `/campaigns`) are `"use client"` components that call `PortalApi` and render results. Types reused from `@vibearning/shared` (Next `transpilePackages`).

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, vitest (lib only).

> **Prerequisites:** Plans 01–09 merged. API running (`pnpm --filter @vibearning/api dev`) for manual use.

> **Verification policy:** `vitest` (PortalApi) + `tsc --noEmit` are the gates. `next build` is attempted as a bonus; if it's flaky in this env, the app still runs via `next dev` (documented). No component/E2E browser tests in this slice.

**Spec:** [2026-06-22-vibearning-ad-marketplace-design.md](../specs/2026-06-22-vibearning-ad-marketplace-design.md) §6.

---

## File Structure

```
apps/portal/
  package.json
  tsconfig.json
  next.config.mjs
  vitest.config.ts
  app/layout.tsx
  app/page.tsx              # links to login / campaigns
  app/login/page.tsx        # register + login (client)
  app/campaigns/page.tsx    # list + create + buy blocks (client)
  lib/api.ts                + lib/api.test.ts
  lib/token.ts
```

---

## Task 1: Scaffold `apps/portal`

- [ ] **Step 1: `apps/portal/package.json`**

```json
{
  "name": "@vibearning/portal",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@vibearning/shared": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `apps/portal/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@vibearning/shared"],
};
export default nextConfig;
```

- [ ] **Step 3: `apps/portal/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: `apps/portal/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
```

- [ ] **Step 5: Install + commit**

Run: `pnpm install`

```bash
git add apps/portal/package.json apps/portal/next.config.mjs apps/portal/tsconfig.json apps/portal/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(portal): scaffold Next.js advertiser portal"
```

---

## Task 2: `PortalApi` client + token (TDD)

**Files:** Create `apps/portal/lib/api.ts`, `lib/api.test.ts`, `lib/token.ts`

- [ ] **Step 1: Failing test — `lib/api.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { PortalApi } from "./api";

function json(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as Response;
}

describe("PortalApi", () => {
  it("register posts credentials and returns token+account", async () => {
    const f = vi.fn().mockResolvedValue(json({ token: "t", account: { id: "a", email: "e", type: "advertiser" } }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch);
    expect(await api.register("e@x.com", "password1")).toMatchObject({ token: "t" });
    expect(f).toHaveBeenCalledWith("http://api/advertiser/register", expect.objectContaining({ method: "POST" }));
  });

  it("createCampaign sends the bearer token", async () => {
    const f = vi.fn().mockResolvedValue(json({ id: "c1" }));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "tok");
    await api.createCampaign({ copy: "Hi there", url: "https://x.dev", surface: "codex-panel", bidPerBlockPaise: 20000 });
    expect(f).toHaveBeenCalledWith("http://api/advertiser/campaigns", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer tok" }),
    }));
  });

  it("listCampaigns GETs with auth", async () => {
    const f = vi.fn().mockResolvedValue(json([{ id: "c1" }]));
    const api = new PortalApi("http://api", f as unknown as typeof fetch, () => "tok");
    expect(await api.listCampaigns()).toHaveLength(1);
  });

  it("throws on a non-ok response", async () => {
    const f = vi.fn().mockResolvedValue(json({ error: "bad" }, false));
    const api = new PortalApi("http://api", f as unknown as typeof fetch);
    await expect(api.login("e@x.com", "x")).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm --filter @vibearning/portal test`)

- [ ] **Step 3: Implement `lib/api.ts`**

```ts
import type { CreateCampaign } from "@vibearning/shared";

export interface AuthResult { token: string; account: { id: string; email: string | null; type: string } }
export interface Campaign { id: string; copy: string; url: string; surface?: string; createdAt?: string }

export class PortalApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly getToken: () => string | undefined = () => undefined,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    const t = this.getToken();
    if (t) h["authorization"] = `Bearer ${t}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, { ...init, headers: this.headers() });
    if (!res.ok) throw new Error(`request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  register(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/register", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  login(email: string, password: string): Promise<AuthResult> {
    return this.req("/advertiser/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  createCampaign(dto: CreateCampaign): Promise<{ id: string }> {
    return this.req("/advertiser/campaigns", { method: "POST", body: JSON.stringify(dto) });
  }
  listCampaigns(): Promise<Campaign[]> {
    return this.req("/advertiser/campaigns", { method: "GET" });
  }
  buyBlocks(campaignId: string, quantity: number): Promise<{ id: string; status: string; amountPaise: number }> {
    return this.req(`/advertiser/campaigns/${campaignId}/blocks`, { method: "POST", body: JSON.stringify({ quantity }) });
  }
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Implement `lib/token.ts`**

```ts
const KEY = "kbi.advToken";

export function getToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(KEY) ?? undefined;
}
export function setToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, token);
}
export function clearToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/portal/lib
git commit -m "feat(portal): PortalApi client + token storage (tested)"
```

---

## Task 3: Pages (compile-only)

**Files:** Create `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`, `app/campaigns/page.tsx`

- [ ] **Step 1: `app/layout.tsx`**

```tsx
export const metadata = { title: "vibearning — Advertisers" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: `app/page.tsx`**

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>vibearning — Advertisers</h1>
      <p>Sponsor the line developers watch while their AI agent thinks.</p>
      <p><Link href="/login">Sign in / Register</Link> · <Link href="/campaigns">My campaigns</Link></p>
    </main>
  );
}
```

- [ ] **Step 3: `app/login/page.tsx`** (client)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortalApi } from "../../lib/api";
import { setToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000");

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: "login" | "register") {
    setError(null);
    try {
      const res = mode === "register" ? await api.register(email, password) : await api.login(email, password);
      setToken(res.token);
      router.push("/campaigns");
    } catch {
      setError(`${mode} failed`);
    }
  }

  return (
    <main>
      <h1>Advertiser sign in</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div>
        <button onClick={() => submit("login")}>Log in</button>
        <button onClick={() => submit("register")}>Register</button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 4: `app/campaigns/page.tsx`** (client)

```tsx
"use client";
import { useEffect, useState } from "react";
import { PortalApi, type Campaign } from "../../lib/api";
import { getToken } from "../../lib/token";

const api = new PortalApi(process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3000", fetch, getToken);

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [copy, setCopy] = useState("");
  const [url, setUrl] = useState("https://");
  const [bid, setBid] = useState(20000);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    try { setCampaigns(await api.listCampaigns()); } catch { setMsg("Sign in first."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function create() {
    setMsg(null);
    try {
      await api.createCampaign({ copy, url, surface: "codex-panel", bidPerBlockPaise: Number(bid) });
      setCopy("");
      await refresh();
    } catch { setMsg("Create failed (check fields / sign in)."); }
  }

  async function buy(id: string) {
    try { const p = await api.buyBlocks(id, 5); setMsg(`Bought 5 blocks (₹${(p.amountPaise / 100).toFixed(2)}, ${p.status}).`); }
    catch { setMsg("Buy failed."); }
  }

  return (
    <main>
      <h1>My campaigns</h1>
      <section>
        <h2>New campaign (codex-panel)</h2>
        <input placeholder="ad copy (≤60)" value={copy} onChange={(e) => setCopy(e.target.value)} maxLength={60} />
        <input placeholder="https://landing" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input type="number" value={bid} onChange={(e) => setBid(Number(e.target.value))} /> <span>paise / block</span>
        <button onClick={create}>Create</button>
      </section>
      {msg && <p>{msg}</p>}
      <ul>
        {campaigns.map((c) => (
          <li key={c.id}>
            <strong>{c.copy}</strong> — {c.url} <button onClick={() => buy(c.id)}>Buy 5 blocks</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck + build + commit**

Run: `pnpm --filter @vibearning/portal lint` (tsc), then `pnpm --filter @vibearning/portal build` (next build — generates `next-env.d.ts`).
Expected: typecheck passes; build succeeds. If `next build` fails for an environment reason, capture the error, ensure `lint` (tsc) is green, and document that the app runs via `pnpm --filter @vibearning/portal dev`.

```bash
git add apps/portal/app apps/portal/next-env.d.ts
git commit -m "feat(portal): home, login, and campaigns pages"
```

---

## Done criteria for Plan 07b

- [ ] `PortalApi` unit tests green (register/login/create/list/buy + auth header + error).
- [ ] `tsc --noEmit` passes for the portal.
- [ ] `next build` succeeds (or, if env-blocked, `next dev` documented + tsc green).
- [ ] Manual: with the api running, register → create campaign → buy blocks works in the browser.

**Remaining follow-ups:** real Stripe/Razorpay SDK + KYC, real spinner-injection adapters, IP-hash clustering, creative moderation, pacing, observability, browser E2E for the portal.
