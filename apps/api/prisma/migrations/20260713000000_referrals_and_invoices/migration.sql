-- Referral program: shareable code + who referred this account + when.
ALTER TABLE "Account" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Account" ADD COLUMN "referredById" TEXT;
ALTER TABLE "Account" ADD COLUMN "referredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Account_referralCode_key" ON "Account"("referralCode");
CREATE INDEX "Account_referredById_idx" ON "Account"("referredById");

ALTER TABLE "Account"
  ADD CONSTRAINT "Account_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- GST invoice number stamped on paid block purchases.
ALTER TABLE "BlockPurchase" ADD COLUMN "invoiceNo" TEXT;
CREATE UNIQUE INDEX "BlockPurchase_invoiceNo_key" ON "BlockPurchase"("invoiceNo");

-- Monotonic counters (per-financial-year invoice sequence, etc.).
CREATE TABLE "Counter" (
  "id" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);
