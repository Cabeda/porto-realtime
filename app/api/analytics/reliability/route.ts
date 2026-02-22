/**
 * API: Reliability rankings and metrics (#71)
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeGrade } from "@/lib/analytics/metrics";
import { parseDateFilter } from "@/lib/analytics/date-filter";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
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
        });
      }
      const agg = routeAgg.get(r.route)!;
      agg.trips += r.tripsObserved;
      if (r.excessWaitTimeSecs !== null) agg.ewts.push(r.excessWaitTimeSecs);
      if (r.headwayAdherencePct !== null) agg.adherences.push(r.headwayAdherencePct);
      if (r.avgCommercialSpeed !== null) agg.speeds.push(r.avgCommercialSpeed);
      if (r.bunchingPct !== null) agg.bunchings.push(r.bunchingPct);
      if (r.gappingPct !== null) agg.gappings.push(r.gappingPct);
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const rankings = [...routeAgg.entries()]
      .map(([route, agg]) => {
        const ewt = avg(agg.ewts);
        const adherence = avg(agg.adherences);
        return {
          route,
          trips: agg.trips,
          ewt: ewt !== null ? Math.round(ewt) : null,
          headwayAdherence: adherence !== null ? Math.round(adherence * 10) / 10 : null,
          avgSpeed: avg(agg.speeds) !== null ? Math.round(avg(agg.speeds)! * 10) / 10 : null,
          bunching: avg(agg.bunchings) !== null ? Math.round(avg(agg.bunchings)! * 10) / 10 : null,
          gapping: avg(agg.gappings) !== null ? Math.round(avg(agg.gappings)! * 10) / 10 : null,
          grade: computeGrade(ewt, adherence),
        };
      })
      .sort((a, b) => (b.ewt ?? 0) - (a.ewt ?? 0));

    const allEwts = rankings.filter((r) => r.ewt !== null).map((r) => r.ewt!);
    const allAdherences = rankings.filter((r) => r.headwayAdherence !== null).map((r) => r.headwayAdherence!);

    return NextResponse.json({
      period: periodLabel,
      networkEwt: avg(allEwts) !== null ? Math.round(avg(allEwts)!) : null,
      networkAdherence: avg(allAdherences) !== null ? Math.round(avg(allAdherences)! * 10) / 10 : null,
      networkBunching: avg(rankings.filter((r) => r.bunching !== null).map((r) => r.bunching!)) !== null
        ? Math.round(avg(rankings.filter((r) => r.bunching !== null).map((r) => r.bunching!))! * 10) / 10
        : null,
      totalRoutes: rankings.length,
      rankings,
    });
  } catch (error) {
    console.error("Reliability error:", error);
    return NextResponse.json({ error: "Failed to fetch reliability data" }, { status: 500 });
  }
}
