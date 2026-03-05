-- DropIndex
DROP INDEX "NetworkSummaryDaily_date_idx";

-- DropIndex
DROP INDEX "RoutePerformanceDaily_route_idx";

-- DropIndex
DROP INDEX "ScheduledTripDaily_date_route_idx";

-- DropIndex
DROP INDEX "StopHeadwayDaily_date_route_idx";

-- CreateIndex
CREATE INDEX "RoutePerformanceDaily_route_date_idx" ON "RoutePerformanceDaily"("route", "date");

-- CreateIndex
CREATE INDEX "StopHeadwayDaily_route_directionId_date_idx" ON "StopHeadwayDaily"("route", "directionId", "date");

-- CreateIndex
CREATE INDEX "TripLog_route_date_idx" ON "TripLog"("route", "date");
