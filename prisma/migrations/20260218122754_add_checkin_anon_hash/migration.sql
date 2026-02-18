-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "anonHash" TEXT;

-- CreateIndex
CREATE INDEX "CheckIn_anonHash_createdAt_idx" ON "CheckIn"("anonHash", "createdAt");
