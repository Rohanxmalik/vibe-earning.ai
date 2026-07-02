// Idempotent DEMO seed: 3 funded, ranked, PAID branded campaigns on the claude-code-panel surface
// (the VS Code extension's surface) so the sidebar shows real "Sponsored" ads with logos + the
// rotation line-up, and impressions actually earn. Safe to re-run (e.g. after a DB reset).
//   pnpm --filter @vibearning/api exec node scripts/seed-demo-ads.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const SURFACES = ["claude-code-panel", "codex-panel"]; // serve on both the Claude Code and Codex extensions
const BID = 20_000; // paise/block; price = floor(BID/1000) = 20 paise per impression
const ESCROW = 1_000_000; // ₹10,000 of budget so it serves for a long time

const logo = (bg, fg, ch) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34"><rect width="34" height="34" rx="7" fill="${bg}"/><text x="17" y="25" font-size="22" fill="${fg}" text-anchor="middle" font-family="sans-serif" font-weight="700">${ch}</text></svg>`,
  ).toString("base64");

const ADS = [
  { headline: "Zomato", tagline: "Delivering Happiness", brandColor: "#E23744", emoji: "🍔", url: "https://zomato.com", iconUrl: logo("#E23744", "#fff", "Z") },
  { headline: "Zepto", tagline: "Groceries in 10 minutes", brandColor: "#7C3AED", emoji: "⚡", url: "https://zepto.com", iconUrl: logo("#7C3AED", "#fff", "Z") },
  { headline: "Blinkit", tagline: "India at your doorstep", brandColor: "#F8CB46", emoji: "🛒", url: "https://blinkit.com", iconUrl: logo("#F8CB46", "#1a1a1a", "B") },
];

async function advertiser() {
  const email = "demo-advertiser@vibearning.dev";
  const found = await prisma.account.findFirst({ where: { email, type: "advertiser" } });
  if (found) return found;
  return prisma.account.create({
    data: { type: "advertiser", email, emailVerified: true, passwordHash: await bcrypt.hash("password123", 10) },
  });
}

async function fundEscrow(campaignId, amountPaise) {
  const eventId = `demo-seed-fund:${campaignId}`; // stable → re-runs won't double-fund
  if ((await prisma.ledgerEntry.count({ where: { eventId } })) > 0) return;
  await prisma.ledgerEntry.createMany({
    data: [
      { eventId, account: "cash:platform", direction: "debit", amount: amountPaise },
      { eventId, account: `escrow:campaign:${campaignId}`, direction: "credit", amount: amountPaise },
    ],
    skipDuplicates: true,
  });
}

async function main() {
  const adv = await advertiser();
  for (const a of ADS) {
    let c = await prisma.campaign.findFirst({ where: { headline: a.headline, advertiserId: adv.id } });
    if (!c) {
      c = await prisma.campaign.create({
        data: {
          advertiserId: adv.id, isHouseAd: false, status: "active",
          copy: `${a.headline} — ${a.tagline}`.slice(0, 60),
          headline: a.headline, tagline: a.tagline, brandColor: a.brandColor, emoji: a.emoji, url: a.url, iconUrl: a.iconUrl,
        },
      });
    } else {
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "active", iconUrl: a.iconUrl, brandColor: a.brandColor, emoji: a.emoji, tagline: a.tagline } });
    }
    // Fund escrow once, then place an active, ranked bid on every target surface.
    await fundEscrow(c.id, ESCROW);
    for (const surface of SURFACES) {
      const bid = await prisma.bid.findFirst({ where: { campaignId: c.id, surface } });
      if (!bid) await prisma.bid.create({ data: { campaignId: c.id, surface, amount: BID, status: "active" } });
      else await prisma.bid.update({ where: { id: bid.id }, data: { amount: BID, status: "active" } });
      await redis.zadd(`rank:${surface}`, BID, c.id);
    }
    console.log(`[demo] ${a.headline} → active, funded, ranked on ${SURFACES.join(" + ")} (id=${c.id})`);
  }
  console.log("[demo] done. /serve on claude-code-panel AND codex-panel should now return 3 ads.");
}

main()
  .catch((e) => { console.error("[demo] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await redis.quit(); });
