/**
 * API: Network summary for analytics dashboard (#68)
 * Returns KPIs, speed timeseries, and fleet activity data.
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";
import { CACHE_1DAY, cacheFor } from "@/lib/analytics/cache";
import { KeyedStaleCache, SingleFlight } from "@/lib/api-fetch";

const CACHE = CACHE_1DAY;
const memCache = new KeyedStaleCache<unknown>(5 * 60 * 1000);
const sf = new SingleFlight(); // 5 minutes

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const cacheKey = request.nextUrl.search || "default";

  const cached = memCache.get(cacheKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  const filter = parseDateFilter(period, dateParam);

  try {
    if (filter.mode === "today") {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const [posCount, vehicleCount, routeCount, avgSpeedResult, lastSummary] = await sf.do(
        cacheKey,
        () =>
          Promise.all([
            prisma.busPositionLog.count({
              where: { recordedAt: { gte: todayStart } },
            }),
            prisma.busPositionLog
              .findMany({
                where: { recordedAt: { gte: todayStart } },
                distinct: ["vehicleId"],
                select: { vehicleId: true },
              })
              .then((r) => r.length),
            prisma.busPositionLog
              .findMany({
                where: {
                  recordedAt: { gte: todayStart },
                  route: { not: null },
                },
                distinct: ["route"],
                select: { route: true },
              })
              .then((r) => r.length),
            prisma.busPositionLog.aggregate({
              where: {
                recordedAt: { gte: todayStart },
                speed: { gt: 0 },
              },
              _avg: { speed: true },
            }),
            prisma.networkSummaryDaily.findFirst({
              orderBy: { date: "desc" },
            }),
          ])
      );

      const data = {
        period: "today",
        activeVehicles: vehicleCount,
        activeRoutes: routeCount,
        positionsCollected: posCount,
        avgSpeed: avgSpeedResult._avg.speed
          ? Math.round(avgSpeedResult._avg.speed * 10) / 10
          : null,
        yesterdayAvgSpeed: lastSummary?.avgCommercialSpeed
          ? Math.round(lastSummary.avgCommercialSpeed * 10) / 10
          : null,
        worstRoute: lastSummary?.worstRoute ?? null,
        worstRouteEwt: lastSummary?.worstRouteEwt ?? null,
        ewt: lastSummary?.avgExcessWaitTime ? Math.round(lastSummary.avgExcessWaitTime) : null,
        lastAggregatedDate: lastSummary?.date ? lastSummary.date.toISOString().slice(0, 10) : null,
      };
      memCache.set(cacheKey, data);
      return NextResponse.json(data, { headers: cacheFor(300) });
    }

    if (filter.mode === "date") {
      const summary = await prisma.networkSummaryDaily.findFirst({
        where: { date: filter.date },
      });

      const routePerf = await prisma.routePerformanceDaily.findMany({
        where: { date: filter.date },
      });

      if (!summary) {
        return NextResponse.json(
          {
            period: filter.dateStr,
            date: filter.dateStr,
            days: 0,
            totalTrips: 0,
            avgSpeed: null,
            ewt: null,
            worstRoute: null,
            worstRouteEwt: null,
            dailySummaries: [],
          },
          { headers: CACHE }
        );
      }

      let worstRoute: string | null = null;
      let worstEwt = 0;
      for (const r of routePerf) {
        if (r.excessWaitTimeSecs !== null && r.excessWaitTimeSecs > worstEwt) {
          worstEwt = r.excessWaitTimeSecs;
          worstRoute = r.route;
        }
      }

      const dateData = {
        period: filter.dateStr,
        date: filter.dateStr,
        days: 1,
        activeVehicles: summary.activeVehicles,
        totalTrips: summary.totalTrips,
        avgSpeed: summary.avgCommercialSpeed
          ? Math.round(summary.avgCommercialSpeed * 10) / 10
          : null,
        ewt: summary.avgExcessWaitTime ? Math.round(summary.avgExcessWaitTime) : null,
        worstRoute,
        worstRouteEwt: worstEwt ? Math.round(worstEwt) : null,
        positionsCollected: Number(summary.positionsCollected),
        dailySummaries: [
          {
            date: filter.dateStr,
            activeVehicles: summary.activeVehicles,
            totalTrips: summary.totalTrips,
            avgSpeed: summary.avgCommercialSpeed,
            ewt: summary.avgExcessWaitTime,
            positions: Number(summary.positionsCollected),
          },
        ],
      };
      memCache.set(cacheKey, dateData);
      return NextResponse.json(dateData, { headers: CACHE });
    }

    // Historical periods: 7d, 30d
    const summaries = await prisma.networkSummaryDaily.findMany({
      where: { date: { gte: filter.fromDate } },
      orderBy: { date: "asc" },
    });

    const routePerf = await prisma.routePerformanceDaily.findMany({
      where: { date: { gte: filter.fromDate } },
      orderBy: { date: "asc" },
    });

    const totalTrips = summaries.reduce((a, s) => a + s.totalTrips, 0);
    const avgSpeed =
      summaries.length > 0
        ? summaries
            .filter((s) => s.avgCommercialSpeed !== null)
            .reduce((a, s) => a + s.avgCommercialSpeed!, 0) /
          summaries.filter((s) => s.avgCommercialSpeed !== null).length
        : null;
    const avgEwt =
      summaries.length > 0
        ? summaries
            .filter((s) => s.avgExcessWaitTime !== null)
            .reduce((a, s) => a + s.avgExcessWaitTime!, 0) /
          summaries.filter((s) => s.avgExcessWaitTime !== null).length
        : null;

    const routeEwts = new Map<string, number[]>();
    for (const r of routePerf) {
      if (r.excessWaitTimeSecs !== null) {
        if (!routeEwts.has(r.route)) routeEwts.set(r.route, []);
        routeEwts.get(r.route)!.push(r.excessWaitTimeSecs);
      }
    }
    let worstRoute: string | null = null;
    let worstEwt = 0;
    for (const [route, ewts] of routeEwts) {
      const avg = ewts.reduce((a, b) => a + b, 0) / ewts.length;
      if (avg > worstEwt) {
        worstEwt = avg;
        worstRoute = route;
      }
    }

    const periodData = {
      period: filter.period,
      days: summaries.length,
      totalTrips,
      avgSpeed: avgSpeed ? Math.round(avgSpeed * 10) / 10 : null,
      ewt: avgEwt ? Math.round(avgEwt) : null,
      worstRoute,
      worstRouteEwt: worstEwt ? Math.round(worstEwt) : null,
      dailySummaries: summaries.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        activeVehicles: s.activeVehicles,
        totalTrips: s.totalTrips,
        avgSpeed: s.avgCommercialSpeed,
        ewt: s.avgExcessWaitTime,
        positions: Number(s.positionsCollected),
      })),
    };
    memCache.set(cacheKey, periodData);
    return NextResponse.json(periodData, { headers: CACHE });
  } catch (error) {
    console.error("Network summary error:", error);
    return NextResponse.json({ error: "Failed to fetch network summary" }, { status: 500 });
  }
}
