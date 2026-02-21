/**
 * API: Network summary for analytics dashboard (#68)
 * Returns KPIs, speed timeseries, and fleet activity data.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "today";

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    if (period === "today") {
      // Live stats from today's raw positions
      const [posCount, vehicleCount, routeCount, avgSpeedResult] =
        await Promise.all([
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
        ]);

      return NextResponse.json({
        period: "today",
        activeVehicles: vehicleCount,
        activeRoutes: routeCount,
        positionsCollected: posCount,
        avgSpeed: avgSpeedResult._avg.speed
          ? Math.round(avgSpeedResult._avg.speed * 10) / 10
          : null,
        // Historical comparisons will come from NetworkSummaryDaily
        yesterdayAvgSpeed: null,
        worstRoute: null,
        ewt: null,
      });
    }

    // Historical periods: 7d, 30d
    const days = period === "7d" ? 7 : 30;
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    fromDate.setUTCHours(0, 0, 0, 0);

    const summaries = await prisma.networkSummaryDaily.findMany({
      where: { date: { gte: fromDate } },
      orderBy: { date: "asc" },
    });

    const routePerf = await prisma.routePerformanceDaily.findMany({
      where: { date: { gte: fromDate } },
      orderBy: { date: "asc" },
    });

    // Aggregate across days
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

    // Find worst route across the period
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

    return NextResponse.json({
      period,
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
    });
  } catch (error) {
    console.error("Network summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch network summary" },
      { status: 500 }
    );
  }
}
