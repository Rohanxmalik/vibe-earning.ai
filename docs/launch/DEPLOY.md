# Deploy runbook

How to put vibearning live. The app images already build in CI (`.github/workflows/cd.yml` → GHCR) and there's a production compose file. This is the step-by-step.

> **Audience:** the engineer doing the deploy. The founder buys the accounts (see `LAUNCH_CHECKLIST.md` Phase 3).

---

## What you're deploying

| Service | Image / build | Port | Notes |
|---------|---------------|------|-------|
| API (NestJS) | `apps/api/Dockerfile` | 3000 | needs Postgres + Redis + secrets |
| Portal (Next.js) | `apps/portal/Dockerfile` | 3001 | `NEXT_PUBLIC_API_BASE` baked at **build** time |
| PostgreSQL | managed (preferred) or `postgres:16` | 5432 | the source of truth for money |
| Redis | managed (preferred) or `redis:7` | 6379 | bid ranking, rate limits, pacing |

**Pick an India region** for Postgres/Redis/API (latency + data residency). Portal can be anywhere (Vercel is easy).

---

## Option A — Managed platform (recommended)

Best balance of simple + production-grade.

1. **Database + cache:** provision **managed Postgres** and **managed Redis** in an India region (Render, Railway, Aiven, Neon + Upstash, AWS RDS/ElastiCache, etc.). Copy their connection URLs.
2. **API:** deploy the API image (from GHCR, built by CD) or build from `apps/api/Dockerfile`.
   - Set every variable from `.env.prod.example` (DATABASE_URL + REDIS_URL = the managed URLs).
   - The image entrypoint runs `prisma migrate deploy` on boot, so the schema is applied automatically.
   - Expose `:3000` behind HTTPS at e.g. `https://api.yourdomain.com`.
3. **Portal:** deploy on **Vercel** (point it at this repo, root `apps/portal`) **or** the portal image.
   - Set `NEXT_PUBLIC_API_BASE=https://api.yourdomain.com` **before building** (it's inlined into the bundle).
   - For the Docker image set it as a build arg; for Vercel set it as an env var.
4. **DNS + SSL:** point `api.` and `app.` (or apex) at the two services; the host terminates SSL.
5. **CORS:** set `CORS_ORIGINS=https://app.yourdomain.com` on the API so only the portal can call it from browsers.
6. **Webhooks:** in Stripe/Razorpay dashboards, point webhooks at `https://api.yourdomain.com/webhooks/stripe` and `/webhooks/razorpay` (see `docs/launch/PAYMENTS_SETUP.md`).
7. **Smoke test** (see checklist below).

---

## Option B — Single VM with docker-compose

Cheapest; you own patching/backups.

```bash
# on an India-region VM with Docker installed
git clone https://github.com/Rohanxmalik/vibe-earning.ai && cd vibe-earning.ai
cp .env.prod.example .env && nano .env          # fill in real secrets
docker compose -f docker-compose.prod.yml up -d --build
```

- This brings up Postgres, Redis, API, and Portal. The API applies migrations on boot.
- Put a reverse proxy (Caddy/Traefik/nginx) in front for HTTPS + domains, mapping
  `api.yourdomain.com → :3000` and `app.yourdomain.com → :3001`.
- **Back up the `pgdata` volume** (it holds the ledger = real money). Schedule `pg_dump`.

---

## Object storage (brand logos)

Advertiser logos upload through `POST /uploads/logo`. Local disk works but is **wiped on every redeploy / scale‑out**, so switch to an S3‑compatible bucket in prod. The `S3Storage` backend is implemented (`apps/api/src/storage/blob-storage.ts`) — you only set env.

1. Create a bucket (**AWS S3**, **Cloudflare R2**, or **Supabase Storage**) and make objects **publicly readable** (logos are public). Optionally put a CDN in front.
2. Create an access key/secret scoped to `PutObject` on that bucket (or use an instance role on AWS).
3. Set on the API:

   | Var | Example | Notes |
   |---|---|---|
   | `VIBEARNING_STORAGE` | `s3` | switches from local disk to S3 |
   | `VIBEARNING_S3_BUCKET` | `vibearning-logos` | bucket name (**required**) |
   | `VIBEARNING_PUBLIC_URL` | `https://cdn.yourdomain.com` | public base the stored URL is built on — bucket public URL or CDN (**required**) |
   | `VIBEARNING_S3_REGION` | `ap-south-1` | AWS region (India) |
   | `VIBEARNING_S3_ACCESS_KEY_ID` / `VIBEARNING_S3_SECRET_ACCESS_KEY` | … | omit to use the default AWS credential chain (instance role) |
   | `VIBEARNING_S3_ENDPOINT` | `https://<acct>.r2.cloudflarestorage.com` | **R2 / Supabase / MinIO only** (omit for AWS S3) |
   | `VIBEARNING_S3_FORCE_PATH_STYLE` | `true` | **R2 / MinIO only** |
   | `VIBEARNING_S3_PREFIX` | `logos/` | optional key prefix |

4. `VIBEARNING_STORAGE=s3` without a bucket **or** public URL makes the API **fail loudly at startup** — never a silent fallback to ephemeral disk. Uploaded logos are content‑addressed (sha256) → deduped and cacheable forever. Reads go straight to the bucket/CDN (the app's `GET /uploads/:name` route is only used by the disk backend).

---

## Secrets

- Generate strong values: `openssl rand -hex 32` for `AUTH_JWT_SECRET`, `FRAUD_IP_SALT`, `ADMIN_API_KEY`.
- **Never** ship the dev defaults (`*-change-me`) to prod. Prefer the host's secret manager over a plaintext `.env`.
- `ADMIN_API_KEY` is now break-glass only — create real admin accounts instead (below).

## First-run tasks

1. **Create an admin account** (the portal admin page logs in via `/admin/login`). Seed one in the DB:
   ```sql
   -- password hash: generate with bcryptjs (10 rounds) offline, then:
   INSERT INTO "Account" (id, type, email, "passwordHash")
   VALUES (gen_random_uuid(), 'admin', 'ops@yourdomain.com', '<bcrypt-hash>');
   ```
   (Or add a tiny one-off seed script; don't expose admin self-signup.)
2. **Seed house ads** so the spinner always has something to show:
   `POST /admin/house-ads` with the admin token (or `x-admin-key`).
3. **Verify webhooks** deliver (send a test event from each PSP dashboard).

## Smoke test (prod)

- [ ] `GET https://api.yourdomain.com/health` → `{"status":"ok"}`
- [ ] Portal loads at `https://app.yourdomain.com`, all pages render.
- [ ] Advertiser can register → create campaign → (admin approves) → buy blocks (real ₹1 test).
- [ ] PSP webhook marks the purchase paid and funds escrow (check the ledger).
- [ ] Developer can sign up, add a UPI, (admin verifies), and a tiny payout settles.
- [ ] `POST /admin/killswitch {active:true}` stops serving; `false` resumes.
- [ ] Advertiser uploads a **logo** on a campaign → the returned `iconUrl` points at your bucket/CDN (`VIBEARNING_PUBLIC_URL`), and the image loads.

## Publish & wire the VS Code extension

The extension is the developer client — it must point at the deployed API.

1. **Set the prod URL.** Edit the defaults in `apps/extension/package.json` (`contributes.configuration` → `vibearning.apiUrl` / `vibearning.portalUrl`) to your real domains. Users can still override via the `vibearning.apiUrl` setting or the `VIBEARNING_API` env var.
2. **Register a Marketplace publisher** (Azure DevOps org) whose id matches `"publisher"` in the manifest, and create a **Personal Access Token** (scope: Marketplace → Manage).
3. **Package + publish:**
   ```bash
   cd apps/extension
   pnpm --filter vibearning package        # → vibearning.vsix (runs the build first)
   npx @vscode/vsce login vibearning       # paste the PAT
   npx @vscode/vsce publish                # or: publish -p <PAT>
   ```
4. **Status‑line users** (Claude Code / Codex) configure `~/.claude/settings.json` to run `dist/statusline.js`; it reads `VIBEARNING_API` (prod default baked in). Document this for users who self‑host.

## Rollback

- CD tags images per commit. Redeploy the previous image tag.
- DB migrations are additive; if a deploy is bad, roll the image back first. Restore from `pg_dump` only as a last resort (it's the money ledger — treat with care).

## Still external (founder tasks)

Hosting/DB/Vercel/Sentry **accounts**, the **domain**, and pointing PSP webhooks — see `LAUNCH_CHECKLIST.md` Phase 3.
