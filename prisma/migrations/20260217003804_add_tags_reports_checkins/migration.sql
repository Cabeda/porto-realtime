-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'MISLEADING', 'OTHER');

-- CreateEnum
CREATE TYPE "TransitMode" AS ENUM ('BUS', 'METRO', 'BIKE', 'WALK', 'SCOOTER');

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "TransitMode" NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_feedbackId_idx" ON "Report"("feedbackId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_feedbackId_userId_key" ON "Report"("feedbackId", "userId");

-- CreateIndex
CREATE INDEX "CheckIn_expiresAt_idx" ON "CheckIn"("expiresAt");

-- CreateIndex
CREATE INDEX "CheckIn_userId_idx" ON "CheckIn"("userId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
