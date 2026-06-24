-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_type_key" ON "Account"("email", "type");
