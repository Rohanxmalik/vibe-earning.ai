-- CreateTable
CREATE TABLE "PayoutDestination" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "vpa" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutDestination_accountId_idx" ON "PayoutDestination"("accountId");

-- AddForeignKey
ALTER TABLE "PayoutDestination" ADD CONSTRAINT "PayoutDestination_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

