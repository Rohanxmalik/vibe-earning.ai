-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "copy" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "iconUrl" TEXT,
    "isHouseAd" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "advertiserId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'dev',
    "email" TEXT,
    "oauthSub" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdEvent" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "visibleMs" INTEGER NOT NULL DEFAULT 0,
    "valid" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockPurchase" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Killswitch" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Killswitch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bid_surface_status_idx" ON "Bid"("surface", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Account_oauthSub_key" ON "Account"("oauthSub");

-- CreateIndex
CREATE INDEX "AdEvent_campaignId_type_valid_idx" ON "AdEvent"("campaignId", "type", "valid");

-- CreateIndex
CREATE INDEX "AdEvent_ipHash_idx" ON "AdEvent"("ipHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdEvent_installId_nonce_key" ON "AdEvent"("installId", "nonce");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_idx" ON "LedgerEntry"("account");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_eventId_account_direction_key" ON "LedgerEntry"("eventId", "account", "direction");

-- CreateIndex
CREATE INDEX "Payout_accountId_idx" ON "Payout"("accountId");

-- CreateIndex
CREATE INDEX "BlockPurchase_campaignId_idx" ON "BlockPurchase"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Killswitch_scope_key" ON "Killswitch"("scope");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockPurchase" ADD CONSTRAINT "BlockPurchase_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

