-- CreateTable
CREATE TABLE "BusPositionLog" (
    "id" BIGSERIAL NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicleId" TEXT NOT NULL,
    "vehicleNum" TEXT,
    "route" TEXT,
    "tripId" TEXT,
    "directionId" SMALLINT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "speed" REAL,
    "heading" REAL,

    CONSTRAINT "BusPositionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusPositionLog_recordedAt_idx" ON "BusPositionLog"("recordedAt");

-- CreateIndex
CREATE INDEX "BusPositionLog_route_recordedAt_idx" ON "BusPositionLog"("route", "recordedAt");

-- CreateIndex
CREATE INDEX "BusPositionLog_vehicleId_recordedAt_idx" ON "BusPositionLog"("vehicleId", "recordedAt");
