// DEMO-ONLY dummy data: one FUNDED advertiser campaign on claude-code-terminal, so
// /serve returns a real "Sponsored:" ad AND an impression actually bills (debits the
// advertiser's escrow, credits the signed-in dev ~50% + the platform). This is the
// piece the plain house-ad seed does NOT give you (house ads show a line but never bill).
//
// Idempotent: re-running reuses the same advertiser + campaign and never double-funds
// (ledger entries are keyed by a stable eventId). Safe to run repeatedly.
//
//   pnpm --filter @kbi/api exec node scripts/seed-demo.mjs
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const DEMOS = [
  { surface: "claude-code-terminal", copy: "Acme DB — serverless Postgres for devs. Try free →", url: "https://example.com/acme-db" },
  { surface: "claude-code-panel",    copy: "Acme DB (editor) — serverless Postgres. Try free →", url: "https://example.com/acme-db" },
];
const BID_AMOUNT = 50_000;     // price = floor(amount/1000) = 50 paise per impression
const ESCROW_PAISE = 5_000_000; // ₹50,000 of dummy budget per campaign

async function seedOne({ surface, copy, url }) {
  let advertiser = await prisma.account.findFirst({ where: { email: "demo-advertiser@kbi.test", type: "advertiser" } });
  if (!advertiser) {
    advertiser = await prisma.account.create({ data: { type: "advertiser", email: "demo-advertiser@kbi.test", emailVerified: true } });
    console.log(`[demo] created advertiser ${advertiser.id}`);
  }

  let campaign = await prisma.campaign.findFirst({ where: { copy, isHouseAd: false } });
  if (!campaign) {
    campaign = await prisma.campaign.create({ data: { copy, url, isHouseAd: false, status: "active", advertiserId: advertiser.id } });
    console.log(`[demo] created campaign ${campaign.id} (${surface})`);
  }

  const existingBid = await prisma.bid.findFirst({ where: { campaignId: campaign.id, surface, status: "active" } });
  if (!existingBid) {
    await prisma.bid.create({ data: { campaignId: campaign.id, surface, amount: BID_AMOUNT, status: "active" } });
    console.log(`[demo] created bid amount=${BID_AMOUNT} on ${surface}`);
  }

  const fundEventId = `demo-fund-v1:${campaign.id}`;
  await prisma.ledgerEntry.createMany({
    data: [
      { eventId: fundEventId, account: "cash:platform", direction: "debit", amount: ESCROW_PAISE },
      { eventId: fundEventId, account: `escrow:campaign:${campaign.id}`, direction: "credit", amount: ESCROW_PAISE },
    ],
    skipDuplicates: true,
  });

  await redis.zadd(`rank:${surface}`, BID_AMOUNT, campaign.id);
  console.log(`[demo] DONE ${surface} campaignId=${campaign.id}`);
}

async function main() {
  for (const demo of DEMOS) await seedOne(demo);
}

main()
  .catch((e) => { console.error("[demo] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await redis.quit(); });
