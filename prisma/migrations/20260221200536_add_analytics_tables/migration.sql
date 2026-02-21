-- CreateTable
CREATE TABLE "RouteSegment" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLon" DOUBLE PRECISION NOT NULL,
    "endLat" DOUBLE PRECISION NOT NULL,
    "endLon" DOUBLE PRECISION NOT NULL,
    "midLat" DOUBLE PRECISION NOT NULL,
    "midLon" DOUBLE PRECISION NOT NULL,
    "lengthM" REAL NOT NULL,
    "geometry" JSONB NOT NULL,

    CONSTRAINT "RouteSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripLog" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "vehicleNum" TEXT,
    "route" TEXT NOT NULL,
    "tripId" TEXT,
    "directionId" SMALLINT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "runtimeSecs" INTEGER,
    "scheduledRuntimeSecs" INTEGER,
    "positions" INTEGER NOT NULL,
    "avgSpeed" REAL,
    "commercialSpeed" REAL,

    CONSTRAINT "TripLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentSpeedHourly" (
    "id" BIGSERIAL NOT NULL,
    "segmentId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT,
    "hourStart" TIMESTAMP(3) NOT NULL,
    "avgSpeed" REAL,
    "medianSpeed" REAL,
    "p10Speed" REAL,
    "p90Speed" REAL,
    "sampleCount" INTEGER NOT NULL,

    CONSTRAINT "SegmentSpeedHourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutePerformanceDaily" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT,
    "tripsObserved" INTEGER NOT NULL,
    "tripsScheduled" INTEGER,
    "avgHeadwaySecs" REAL,
    "scheduledHeadwaySecs" REAL,
    "headwayAdherencePct" REAL,
    "excessWaitTimeSecs" REAL,
    "avgRuntimeSecs" REAL,
    "avgCommercialSpeed" REAL,
    "bunchingPct" REAL,
    "gappingPct" REAL,

    CONSTRAINT "RoutePerformanceDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkSummaryDaily" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "activeVehicles" INTEGER NOT NULL,
    "totalTrips" INTEGER NOT NULL,
    "avgCommercialSpeed" REAL,
    "avgExcessWaitTime" REAL,
    "worstRoute" TEXT,
    "worstRouteEwt" REAL,
    "positionsCollected" BIGINT NOT NULL,

    CONSTRAINT "NetworkSummaryDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteSegment_route_directionId_idx" ON "RouteSegment"("route", "directionId");

-- CreateIndex
CREATE INDEX "TripLog_date_route_idx" ON "TripLog"("date", "route");

-- CreateIndex
CREATE INDEX "TripLog_vehicleId_date_idx" ON "TripLog"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "SegmentSpeedHourly_route_hourStart_idx" ON "SegmentSpeedHourly"("route", "hourStart");

-- CreateIndex
CREATE INDEX "SegmentSpeedHourly_hourStart_idx" ON "SegmentSpeedHourly"("hourStart");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentSpeedHourly_segmentId_hourStart_key" ON "SegmentSpeedHourly"("segmentId", "hourStart");

-- CreateIndex
CREATE INDEX "RoutePerformanceDaily_date_idx" ON "RoutePerformanceDaily"("date");

-- CreateIndex
CREATE INDEX "RoutePerformanceDaily_route_idx" ON "RoutePerformanceDaily"("route");

-- CreateIndex
CREATE UNIQUE INDEX "RoutePerformanceDaily_date_route_directionId_key" ON "RoutePerformanceDaily"("date", "route", "directionId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkSummaryDaily_date_key" ON "NetworkSummaryDaily"("date");

-- CreateIndex
CREATE INDEX "NetworkSummaryDaily_date_idx" ON "NetworkSummaryDaily"("date");
