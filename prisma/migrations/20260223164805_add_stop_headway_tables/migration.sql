-- CreateTable
CREATE TABLE "RouteStop" (
    "id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT NOT NULL,
    "stopSequence" INTEGER NOT NULL,
    "stopId" TEXT NOT NULL,
    "stopName" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopHeadwayDaily" (
    "id" BIGSERIAL NOT NULL,
    "date" DATE NOT NULL,
    "route" TEXT NOT NULL,
    "directionId" SMALLINT,
    "stopId" TEXT NOT NULL,
    "stopName" TEXT,
    "stopSequence" INTEGER NOT NULL,
    "avgHeadwaySecs" REAL,
    "headwayStdDev" REAL,
    "observations" INTEGER NOT NULL,

    CONSTRAINT "StopHeadwayDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteStop_route_directionId_idx" ON "RouteStop"("route", "directionId");

-- CreateIndex
CREATE INDEX "StopHeadwayDaily_date_route_idx" ON "StopHeadwayDaily"("date", "route");

-- CreateIndex
CREATE UNIQUE INDEX "StopHeadwayDaily_date_route_directionId_stopId_key" ON "StopHeadwayDaily"("date", "route", "directionId", "stopId");
