-- AlterTable
ALTER TABLE "RoutePerformanceDaily" ADD COLUMN     "canceledPct" REAL,
ADD COLUMN     "canceledTrips" INTEGER;

-- CreateTable
CREATE TABLE "ScheduledTripDaily" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT,
    "tripId" TEXT NOT NULL,

    CONSTRAINT "ScheduledTripDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTripDaily_date_route_idx" ON "ScheduledTripDaily"("date", "route");

-- CreateIndex
CREATE INDEX "ScheduledTripDaily_date_route_directionId_idx" ON "ScheduledTripDaily"("date", "route", "directionId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTripDaily_date_tripId_key" ON "ScheduledTripDaily"("date", "tripId");
