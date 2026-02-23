-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'PLANNED_FIX', 'RESOLVED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'OPERATOR';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "OperatorResponse" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperatorResponse_feedbackId_key" ON "OperatorResponse"("feedbackId");

-- CreateIndex
CREATE INDEX "OperatorResponse_feedbackId_idx" ON "OperatorResponse"("feedbackId");

-- CreateIndex
CREATE INDEX "OperatorResponse_operatorId_idx" ON "OperatorResponse"("operatorId");

-- AddForeignKey
ALTER TABLE "OperatorResponse" ADD CONSTRAINT "OperatorResponse_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorResponse" ADD CONSTRAINT "OperatorResponse_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
