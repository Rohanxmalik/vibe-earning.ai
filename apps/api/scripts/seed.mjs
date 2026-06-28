// Idempotent production seed: create the first admin account + house ads so the
// spinner always has something to show. Run after migrations:
//   SEED_ADMIN_EMAIL=ops@you.com SEED_ADMIN_PASSWORD=... pnpm --filter @kbi/api seed
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

// House ads promote the platform itself; one per surface, ranked at score 0 (house
// ads bypass escrow but must be in the ranking zset to be served).
const HOUSE_ADS = [
  { copy: "Earn while your AI thinks — kickbacks.in", url: "https://kickbacks.in", surface: "claude-code-terminal" },
  { copy: "Get paid for your AI's idle moments", url: "https://kickbacks.in", surface: "codex-panel" },
  { copy: "Developers: turn spinner time into ₹", url: "https://kickbacks.in", surface: "gemini-cli-terminal" },
  { copy: "Earn while Claude works — kickbacks.in", url: "https://kickbacks.in", surface: "claude-code-panel" },
];

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn("[seed] SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD not set — skipping admin.");
    return;
  }
  const existing = await prisma.account.findFirst({ where: { email, type: "admin" } });
  if (existing) {
    console.log(`[seed] admin ${email} already exists — skipping.`);
    return;
  }
  await prisma.account.create({ data: { type: "admin", email, emailVerified: true, passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`[seed] created admin ${email}.`);
}

async function seedHouseAds() {
  for (const ad of HOUSE_ADS) {
    const existing = await prisma.campaign.findFirst({ where: { copy: ad.copy, isHouseAd: true } });
    if (existing) {
      console.log(`[seed] house ad "${ad.copy}" already exists — skipping.`);
      continue;
    }
    const c = await prisma.campaign.create({ data: { copy: ad.copy, url: ad.url, isHouseAd: true, status: "active" } });
    await redis.zadd(`rank:${ad.surface}`, 0, c.id); // make it servable
    console.log(`[seed] created house ad "${ad.copy}" on ${ad.surface}.`);
  }
}

async function main() {
  await seedAdmin();
  await seedHouseAds();
}

main()
  .catch((e) => { console.error("[seed] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await redis.quit(); });
