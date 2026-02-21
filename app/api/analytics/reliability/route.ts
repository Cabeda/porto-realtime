/**
 * API: Reliability rankings and metrics (#71)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeGrade } from "@/lib/analytics/metrics";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "7d";

  try {
    const now = new Date();
    const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    fromDate.setUTCHours(0, 0, 0, 0);

    const perf = await prisma.routePerformanceDaily.findMany({
      where: { date: { gte: fromDate } },
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
      .sort((a, b) => (b.ewt ?? 0) - (a.ewt ?? 0)); // worst first

    // Network-wide averages
    const allEwts = rankings.filter((r) => r.ewt !== null).map((r) => r.ewt!);
    const allAdherences = rankings.filter((r) => r.headwayAdherence !== null).map((r) => r.headwayAdherence!);

    return NextResponse.json({
      period,
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
