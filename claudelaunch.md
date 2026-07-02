# Run vibearning locally — extension test guide

For a co‑founder who wants to **run the VS Code extension on their own laptop** and watch it show a sponsored ad + earn, end to end. Works on **macOS and Windows** (commands are identical).

The extension is just the client — it needs the **local backend** (API + Postgres + Redis) running. This guide gets both up, then launches the extension.

---

## 0. Prerequisites (install once)

- **Node 20+** and **pnpm** — `npm install -g pnpm` (or `corepack enable`).
- **Docker Desktop** — for Postgres + Redis. Start it before the steps below (whale icon = running).
- **VS Code** — the desktop app.
- **Claude Code extension** in VS Code (Anthropic) — the in‑editor ad only shows while *Claude Code* is thinking. Install it and sign into Claude.
- **git**.

---

## 1. One‑time setup

From the repo root (`vibe-earning.ai/`):

```bash
git clone https://github.com/Rohanxmalik/vibe-earning.ai.git
cd vibe-earning.ai
git checkout feat/cc-vscode-sponsored-line   # the extension branch (until it's merged to main)

pnpm install
```

**Create the API env file** at `apps/api/.env` (note the DB port is **5433**):

```bash
cat > apps/api/.env <<'EOF'
DATABASE_URL=postgresql://kbi:kbi@localhost:5433/kbi?schema=public
REDIS_URL=redis://localhost:6379
AUTH_JWT_SECRET=dev-secret-change-me-at-least-32-characters
ADMIN_API_KEY=dev-admin-key
EOF
```

**Start Postgres + Redis, prepare the DB, and seed demo ads:**

```bash
docker compose up -d                                  # postgres :5433, redis :6379

pnpm --filter @vibearning/shared build                # the API + extension import this
pnpm --filter @vibearning/api prisma:generate         # generate the Prisma client
pnpm --filter @vibearning/api prisma:deploy           # apply DB migrations

node apps/api/scripts/seed-demo-ads.mjs               # 3 funded, branded ads (Zomato/Zepto/Blinkit)
pnpm --filter vibearning build                        # build the extension → apps/extension/dist
```

---

## 2. Every time you want to test

**A. Make sure infra is up** (Docker Desktop running), then:

```bash
docker compose up -d                                  # no‑op if already running
pnpm --filter @vibearning/api dev                     # starts the API on http://localhost:3000
```

Leave that running. In another terminal, confirm it's healthy:

```bash
curl http://localhost:3000/health                     # → {"status":"ok"}
```

**B. Launch the extension** (this is the "run it" step):

1. Open the **repo folder** in VS Code (`code .` from the repo root, or File → Open Folder).
2. Press **F5** (or Run and Debug → **"Run vibearning Extension"**).
3. A second window opens: **[Extension Development Host]**. This has the vibearning extension loaded and already pointed at your local API (the launch config sets `VIBEARNING_API=http://localhost:3000`).

---

## 3. See it work

In the **[Extension Development Host]** window:

1. Click the **⚡ vibearning** icon in the left Activity Bar → the panel opens (earnings + "Waiting for your AI to work…").
2. `Cmd/Ctrl+Shift+P` → **"vibearning: Sign in"** → **Create account** (any email + an 8‑char password). This attributes earnings to you.
3. Give **Claude Code a prompt** in this window (open the Claude panel and ask it anything that takes a few seconds — e.g. "search the web for X").
4. **While it's thinking**, watch:
   - the **sidebar card**: the branded ad (a logo + **Zomato** big, with **Zepto / Blinkit** under "In rotation · up next"), a pulsing "Live — earning while your AI works",
   - the **bottom status bar**: the sponsored line,
   - your **earnings** tick up as impressions bill.

That's the full loop: ad shows while the AI thinks → you earn.

> The tiny grey line at the bottom of the panel (`build … · live · 3 ads · …`) is a debug readout — handy to confirm ads arrived.

---

## 4. (Optional) Watch earnings on the web dashboard

```bash
pnpm --filter @vibearning/portal dev                  # http://localhost:3001
```

Sign in with the **same** email/password you created in the extension → the dashboard shows Today/Month/Lifetime earnings, the impressions chart, and payouts.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Panel stuck on **"Waiting…"**, no ad even while Claude works | (1) Is the API up? `curl localhost:3000/health`. (2) You must be **signed in**. (3) The ad shows **only while Claude is actively thinking** — a finished turn clears it. |
| **"Sign in to earn"** in the panel | You're signed out → run **"vibearning: Sign in"**. |
| No ads and `/serve` returns 0 | **Reseed:** `node apps/api/scripts/seed-demo-ads.mjs`. Running the API tests (`apps/api` jest) **wipes the dev DB** — always reseed after. |
| API won't start: `Can't reach database server` | Docker Desktop isn't running, or containers are down → start Docker, then `docker compose up -d`. |
| Extension hits `api.vibearning.in` instead of localhost | You didn't launch via **F5** (which sets the localhost env). Either use F5, or set the VS Code setting `vibearning.apiUrl` = `http://localhost:3000`. |
| Port 3000 / 5433 / 6379 already in use | Stop whatever's using it (another API/DB), or change the port in `apps/api/.env` + `docker-compose.yml`. |
| No **⚡ vibearning** icon in the dev host | The extension didn't load — rebuild (`pnpm --filter vibearning build`) and press F5 again. |

---

## Cheat sheet (after one‑time setup)

```bash
docker compose up -d                    # infra
pnpm --filter @vibearning/api dev       # API (:3000)
# → open the repo in VS Code, press F5, then in the dev host: Sign in + prompt Claude
node apps/api/scripts/seed-demo-ads.mjs # if ads ever disappear
```
