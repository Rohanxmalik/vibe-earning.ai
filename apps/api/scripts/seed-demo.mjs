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

const SURFACE = "claude-code-terminal";
const COPY = "Acme DB — serverless Postgres for devs. Try free →";
const URL = "https://example.com/acme-db";
const BID_AMOUNT = 50_000; // price = floor(amount/1000) = 50 paise per impression
const ESCROW_PAISE = 5_000_000; // ₹50,000 of dummy budget (~100k impressions)

async function main() {
  // 1. A dummy advertiser to own the campaign.
  let advertiser = await prisma.account.findFirst({ where: { email: "demo-advertiser@kbi.test", type: "advertiser" } });
  if (!advertiser) {
    advertiser = await prisma.account.create({ data: { type: "advertiser", email: "demo-advertiser@kbi.test", emailVerified: true } });
    console.log(`[demo] created advertiser ${advertiser.id}`);
  }

  // 2. The funded (non-house) campaign — active so it's eligible to serve.
  let campaign = await prisma.campaign.findFirst({ where: { copy: COPY, isHouseAd: false } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: { copy: COPY, url: URL, isHouseAd: false, status: "active", advertiserId: advertiser.id },
    });
    console.log(`[demo] created campaign ${campaign.id}`);
  }

  // 3. An active bid on the surface (drives ranking + the second-price billing).
  const existingBid = await prisma.bid.findFirst({ where: { campaignId: campaign.id, surface: SURFACE, status: "active" } });
  if (!existingBid) {
    await prisma.bid.create({ data: { campaignId: campaign.id, surface: SURFACE, amount: BID_AMOUNT, status: "active" } });
    console.log(`[demo] created bid amount=${BID_AMOUNT} on ${SURFACE}`);
  }

  // 4. Fund escrow via the double-entry ledger (cash:platform → escrow:campaign:<id>).
  //    Stable eventId => idempotent; re-runs never double-fund.
  const fundEventId = `demo-fund-v1:${campaign.id}`;
  await prisma.ledgerEntry.createMany({
    data: [
      { eventId: fundEventId, account: "cash:platform", direction: "debit", amount: ESCROW_PAISE },
      { eventId: fundEventId, account: `escrow:campaign:${campaign.id}`, direction: "credit", amount: ESCROW_PAISE },
    ],
    skipDuplicates: true,
  });

  // 5. Put it in the ranking zset ABOVE the house ad (score 0) so it wins the auction.
  await redis.zadd(`rank:${SURFACE}`, BID_AMOUNT, campaign.id);

  // Report final escrow balance.
  const entries = await prisma.ledgerEntry.findMany({ where: { account: `escrow:campaign:${campaign.id}` } });
  const escrow = entries.reduce((s, e) => s + (e.direction === "credit" ? e.amount : -e.amount), 0);
  console.log(`[demo] DONE. campaignId=${campaign.id} surface=${SURFACE} escrow=${escrow} paise (₹${escrow / 100})`);
}

main()
  .catch((e) => { console.error("[demo] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await redis.quit(); });
