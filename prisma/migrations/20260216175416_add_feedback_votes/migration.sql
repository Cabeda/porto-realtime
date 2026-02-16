-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackVote_feedbackId_idx" ON "FeedbackVote"("feedbackId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_userId_feedbackId_key" ON "FeedbackVote"("userId", "feedbackId");

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
