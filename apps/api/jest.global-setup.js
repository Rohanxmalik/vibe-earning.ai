// Runs once before the whole Jest suite: gives every run a pristine DB + Redis so
// rows/keys left by a previous run can never make a later run flake. Within a run,
// files share one DB serially (maxWorkers:1) and each cleans what it touches.
require("dotenv/config");

module.exports = async () => {
  const { PrismaClient } = require("@prisma/client");
  const Redis = require("ioredis");

  const prisma = new PrismaClient();
  // FK-safe deletion order.
  await prisma.ledgerEntry.deleteMany();
  await prisma.adEvent.deleteMany();
  await prisma.blockPurchase.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.payoutDestination.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.account.deleteMany();
  await prisma.killswitch.deleteMany();
  await prisma.adminAudit.deleteMany();
  await prisma.$disconnect();

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  await redis.flushall();
  await redis.quit();
};
