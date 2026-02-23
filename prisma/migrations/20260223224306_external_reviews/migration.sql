-- CreateTable
CREATE TABLE "ExternalReview" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "text" TEXT,
    "thumbsUp" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalReview_source_reviewedAt_idx" ON "ExternalReview"("source", "reviewedAt");

-- CreateIndex
CREATE INDEX "ExternalReview_reviewedAt_idx" ON "ExternalReview"("reviewedAt");
