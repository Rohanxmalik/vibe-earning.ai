// TEST-ONLY inventory: three funded advertisers (Zomato, Zepto, Blinkit) on the
// claude-code-panel surface, with DESCENDING bids so /serve ranks them
// Zomato > Zepto > Blinkit (highest bid shown first). Used to demo the in-editor
// 3-ad rotation loop. Idempotent: re-running reuses the same campaigns and never
// double-funds (ledger entries keyed by a stable eventId).
//
//   pnpm --filter @kbi/api exec node scripts/seed-test-ads.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const SURFACE = "claude-code-panel";
const ESCROW_PAISE = 5_000_000; // ₹50,000 of dummy budget per campaign

// Bids descend so the ranking (and thus the rotation order) is Zomato, Zepto, Blinkit.
// All sit ABOVE the existing Acme demo (50,000) so they are the top 3 the panel serves.
const ADS = [
  { copy: "Zomato — food delivered in 30 min. Order now →", url: "https://zomato.com", bid: 90_000 },
  { copy: "Zepto — 10-minute grocery delivery. Try free →", url: "https://zepto.com", bid: 80_000 },
  { copy: "Blinkit — groceries in minutes. Shop now →", url: "https://blinkit.com", bid: 70_000 },
];

async function seedOne({ copy, url, bid }, advertiserId) {
  let campaign = await prisma.campaign.findFirst({ where: { copy, isHouseAd: false } });
  if (!campaign) {
    campaign = await prisma.campaign.create({ data: { copy, url, isHouseAd: false, status: "active", advertiserId } });
    console.log(`[test-ads] created campaign ${campaign.id} (${copy.slice(0, 20)}…)`);
  }

  const existingBid = await prisma.bid.findFirst({ where: { campaignId: campaign.id, surface: SURFACE, status: "active" } });
  if (!existingBid) {
    await prisma.bid.create({ data: { campaignId: campaign.id, surface: SURFACE, amount: bid, status: "active" } });
    console.log(`[test-ads] created bid amount=${bid} on ${SURFACE}`);
  }

  const fundEventId = `test-ads-fund-v1:${campaign.id}`;
  await prisma.ledgerEntry.createMany({
    data: [
      { eventId: fundEventId, account: "cash:platform", direction: "debit", amount: ESCROW_PAISE },
      { eventId: fundEventId, account: `escrow:campaign:${campaign.id}`, direction: "credit", amount: ESCROW_PAISE },
    ],
    skipDuplicates: true,
  });

  await redis.zadd(`rank:${SURFACE}`, bid, campaign.id);
  console.log(`[test-ads] DONE ${SURFACE} campaignId=${campaign.id} bid=${bid}`);
}

async function main() {
  let advertiser = await prisma.account.findFirst({ where: { email: "demo-advertiser@kbi.test", type: "advertiser" } });
  if (!advertiser) {
    advertiser = await prisma.account.create({ data: { type: "advertiser", email: "demo-advertiser@kbi.test", emailVerified: true } });
    console.log(`[test-ads] created advertiser ${advertiser.id}`);
  }
  for (const a of ADS) await seedOne(a, advertiser.id);
}

main()
  .catch((e) => { console.error("[test-ads] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await redis.quit(); });
