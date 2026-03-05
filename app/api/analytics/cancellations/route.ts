/**
 * API: Canceled trips analytics
 * Requires ScheduledTripDaily to be populated by the snapshot-schedule cron (01:00 UTC).
 * canceledPct is an upper bound — GPS gaps are indistinguishable from true cancellations.
 * Supports: period=7d|30d or date=YYYY-MM-DD
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
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
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 1);
      fromDate.setUTCHours(0, 0, 0, 0);
      dateWhere = { date: { gte: fromDate } };
      periodLabel = "today";
    }

    const perf = await prisma.routePerformanceDaily.findMany({
      where: { ...dateWhere, tripsScheduled: { not: null } },
      select: {
        route: true,
        tripsObserved: true,
        tripsScheduled: true,
      },
    });

    // Aggregate per route (combine directions)
    // canceledTrips is derived: scheduled - observed (upper bound)
    const routeAgg = new Map<string, { observed: number; scheduled: number }>();

    for (const r of perf) {
      if (!routeAgg.has(r.route)) {
        routeAgg.set(r.route, { observed: 0, scheduled: 0 });
      }
      const agg = routeAgg.get(r.route)!;
      agg.observed += r.tripsObserved;
      agg.scheduled += r.tripsScheduled ?? 0;
    }

    const routes = [...routeAgg.entries()]
      .map(([route, agg]) => {
        const canceled = Math.max(0, agg.scheduled - agg.observed);
        const canceledPct =
          agg.scheduled > 0 ? Math.round((canceled / agg.scheduled) * 1000) / 10 : null;
        return {
          route,
          tripsScheduled: agg.scheduled,
          tripsObserved: agg.observed,
          canceledTrips: canceled,
          canceledPct,
        };
      })
      .filter((r) => r.canceledPct !== null)
      .sort((a, b) => (b.canceledPct ?? 0) - (a.canceledPct ?? 0));

    const totalScheduled = routes.reduce((a, r) => a + r.tripsScheduled, 0);
    const totalCanceled = routes.reduce((a, r) => a + r.canceledTrips, 0);
    const networkCanceledPct =
      totalScheduled > 0 ? Math.round((totalCanceled / totalScheduled) * 1000) / 10 : null;

    const data = {
      period: periodLabel,
      networkCanceledPct,
      totalScheduled,
      totalCanceled,
      routes,
    };
    memCache.set(cacheKey, data);
    return NextResponse.json(data, { headers: CACHE });
  } catch (error) {
    console.error("Cancellations error:", error);
    return NextResponse.json({ error: "Failed to fetch cancellation data" }, { status: 500 });
  }
}
