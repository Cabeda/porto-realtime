/**
 * API: Reliability rankings and metrics (#71)
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeGrade } from "@/lib/analytics/metrics";
import { parseDateFilter } from "@/lib/analytics/date-filter";
import { KeyedStaleCache } from "@/lib/api-fetch";

const CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" };
const memCache = new KeyedStaleCache<unknown>(5 * 60 * 1000);

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const cacheKey = request.nextUrl.search || "default";

  const cached = memCache.get(cacheKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  const filter = parseDateFilter(period || "7d", dateParam);

  try {
    let dateWhere: object;
    let periodLabel: string;

    if (filter.mode === "date") {
      dateWhere = { date: filter.date };
      periodLabel = filter.dateStr;
    } else if (filter.mode === "period") {
      dateWhere = { date: { gte: filter.fromDate } };
      periodLabel = filter.period;
    } else {
      // "today" — use last 1 day of aggregated data
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 1);
      fromDate.setUTCHours(0, 0, 0, 0);
      dateWhere = { date: { gte: fromDate } };
      periodLabel = "today";
    }

    const perf = await prisma.routePerformanceDaily.findMany({
      where: dateWhere,
      orderBy: { date: "asc" },
    });

    // Aggregate per route (combine directions)
    const routeAgg = new Map<
      string,
      {
        trips: number;
        ewts: number[];
        adherences: number[];
        speeds: number[];
        bunchings: number[];
        gappings: number[];
        canceledPcts: number[];
        canceledTrips: number;
        tripsScheduled: number;
      }
    >();

    for (const r of perf) {
      if (!routeAgg.has(r.route)) {
        routeAgg.set(r.route, {
          trips: 0,
          ewts: [],
          adherences: [],
          speeds: [],
          bunchings: [],
          gappings: [],
          canceledPcts: [],
          canceledTrips: 0,
          tripsScheduled: 0,
        });
      }
      const agg = routeAgg.get(r.route)!;
      agg.trips += r.tripsObserved;
      if (r.excessWaitTimeSecs !== null) agg.ewts.push(r.excessWaitTimeSecs);
      if (r.headwayAdherencePct !== null) agg.adherences.push(r.headwayAdherencePct);
      if (r.avgCommercialSpeed !== null) agg.speeds.push(r.avgCommercialSpeed);
      if (r.bunchingPct !== null) agg.bunchings.push(r.bunchingPct);
      if (r.gappingPct !== null) agg.gappings.push(r.gappingPct);
      if (r.canceledPct !== null) agg.canceledPcts.push(r.canceledPct);
      if (r.canceledTrips !== null) agg.canceledTrips += r.canceledTrips;
      if (r.tripsScheduled !== null) agg.tripsScheduled += r.tripsScheduled;
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const rankings = [...routeAgg.entries()]
      .map(([route, agg]) => {
        const ewt = avg(agg.ewts);
        const adherence = avg(agg.adherences);
        // Use raw counts for weighted canceledPct; fall back to null if no snapshot data
        const canceledPct =
          agg.tripsScheduled > 0
            ? Math.round((agg.canceledTrips / agg.tripsScheduled) * 1000) / 10
            : null;
        return {
          route,
          trips: agg.trips,
          ewt: ewt !== null ? Math.round(ewt) : null,
          headwayAdherence: adherence !== null ? Math.round(adherence * 10) / 10 : null,
          avgSpeed: avg(agg.speeds) !== null ? Math.round(avg(agg.speeds)! * 10) / 10 : null,
          bunching: avg(agg.bunchings) !== null ? Math.round(avg(agg.bunchings)! * 10) / 10 : null,
          gapping: avg(agg.gappings) !== null ? Math.round(avg(agg.gappings)! * 10) / 10 : null,
          canceledPct: canceledPct !== null ? Math.round(canceledPct * 10) / 10 : null,
          grade: computeGrade(ewt, adherence, avg(agg.speeds)),
        };
      })
      .sort((a, b) => (b.ewt ?? 0) - (a.ewt ?? 0));

    const allEwts = rankings.filter((r) => r.ewt !== null).map((r) => r.ewt!);
    const allAdherences = rankings
      .filter((r) => r.headwayAdherence !== null)
      .map((r) => r.headwayAdherence!);

    // Weighted network canceled pct: sum raw counts across all routes
    const totalScheduled = [...routeAgg.values()].reduce((a, r) => a + r.tripsScheduled, 0);
    const totalCanceled = [...routeAgg.values()].reduce((a, r) => a + r.canceledTrips, 0);
    const networkCanceledPct =
      totalScheduled > 0 ? Math.round((totalCanceled / totalScheduled) * 1000) / 10 : null;

    const data = {
      period: periodLabel,
      networkEwt: avg(allEwts) !== null ? Math.round(avg(allEwts)!) : null,
      networkAdherence:
        avg(allAdherences) !== null ? Math.round(avg(allAdherences)! * 10) / 10 : null,
      networkBunching:
        avg(rankings.filter((r) => r.bunching !== null).map((r) => r.bunching!)) !== null
          ? Math.round(
              avg(rankings.filter((r) => r.bunching !== null).map((r) => r.bunching!))! * 10
            ) / 10
          : null,
      networkCanceledPct,
      totalRoutes: rankings.length,
      rankings,
    };
    memCache.set(cacheKey, data);
    return NextResponse.json(data, { headers: CACHE });
  } catch (error) {
    console.error("Reliability error:", error);
    return NextResponse.json({ error: "Failed to fetch reliability data" }, { status: 500 });
  }
}
