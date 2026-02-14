-- AlterEnum
ALTER TYPE "FeedbackType" ADD VALUE 'VEHICLE';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "metadata" JSONB;
