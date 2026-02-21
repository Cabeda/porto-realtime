/**
 * API: Line analytics (#70)
 * Per-route performance data: trips, headways, speeds, stringline data.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeGrade } from "@/lib/analytics/metrics";

export async function GET(request: NextRequest) {
  const route = request.nextUrl.searchParams.get("route");
  const period = request.nextUrl.searchParams.get("period") || "7d";
  const view = request.nextUrl.searchParams.get("view") || "summary";

  if (!route) {
    return NextResponse.json(
      { error: "route parameter required" },
      { status: 400 }
    );
  }

  try {
    const now = new Date();
    const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    fromDate.setUTCHours(0, 0, 0, 0);

    if (view === "summary") {
      const perf = await prisma.routePerformanceDaily.findMany({
        where: { route, date: { gte: fromDate } },
        orderBy: { date: "asc" },
      });

      const trips = await prisma.tripLog.findMany({
        where: { route, date: { gte: fromDate } },
        orderBy: { startedAt: "asc" },
      });

      const avgEwt =
        perf.length > 0
          ? perf
              .filter((p) => p.excessWaitTimeSecs !== null)
              .reduce((a, p) => a + p.excessWaitTimeSecs!, 0) /
            perf.filter((p) => p.excessWaitTimeSecs !== null).length
          : null;

      const avgAdherence =
        perf.length > 0
          ? perf
              .filter((p) => p.headwayAdherencePct !== null)
              .reduce((a, p) => a + p.headwayAdherencePct!, 0) /
            perf.filter((p) => p.headwayAdherencePct !== null).length
          : null;

      const avgSpeed =
        perf.length > 0
          ? perf
              .filter((p) => p.avgCommercialSpeed !== null)
              .reduce((a, p) => a + p.avgCommercialSpeed!, 0) /
            perf.filter((p) => p.avgCommercialSpeed !== null).length
          : null;

      return NextResponse.json({
        route,
        period,
        grade: computeGrade(avgEwt, avgAdherence),
        totalTrips: trips.length,
        avgEwt: avgEwt ? Math.round(avgEwt) : null,
        avgHeadwayAdherence: avgAdherence
          ? Math.round(avgAdherence * 10) / 10
          : null,
        avgCommercialSpeed: avgSpeed
          ? Math.round(avgSpeed * 10) / 10
          : null,
        avgBunching:
          perf.length > 0
            ? Math.round(
                (perf
                  .filter((p) => p.bunchingPct !== null)
                  .reduce((a, p) => a + p.bunchingPct!, 0) /
                  perf.filter((p) => p.bunchingPct !== null).length) *
                  10
              ) / 10
            : null,
        avgGapping:
          perf.length > 0
            ? Math.round(
                (perf
                  .filter((p) => p.gappingPct !== null)
                  .reduce((a, p) => a + p.gappingPct!, 0) /
                  perf.filter((p) => p.gappingPct !== null).length) *
                  10
              ) / 10
            : null,
        dailyPerformance: perf.map((p) => ({
          date: p.date.toISOString().slice(0, 10),
          trips: p.tripsObserved,
          ewt: p.excessWaitTimeSecs,
          adherence: p.headwayAdherencePct,
          speed: p.avgCommercialSpeed,
          bunching: p.bunchingPct,
          gapping: p.gappingPct,
        })),
      });
    }

    if (view === "stringline") {
      // Return trip trajectories for Marey chart
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

      const positions = await prisma.busPositionLog.findMany({
        where: {
          route,
          recordedAt: { gte: todayStart, lt: todayEnd },
        },
        orderBy: { recordedAt: "asc" },
        select: {
          recordedAt: true,
          vehicleId: true,
          vehicleNum: true,
          lat: true,
          lon: true,
          speed: true,
          directionId: true,
        },
      });

      // Group by vehicle
      const vehicleTrails = new Map<
        string,
        { time: string; lat: number; lon: number; speed: number | null }[]
      >();
      for (const p of positions) {
        if (!vehicleTrails.has(p.vehicleId)) {
          vehicleTrails.set(p.vehicleId, []);
        }
        vehicleTrails.get(p.vehicleId)!.push({
          time: p.recordedAt.toISOString(),
          lat: p.lat,
          lon: p.lon,
          speed: p.speed,
        });
      }

      return NextResponse.json({
        route,
        date: todayStart.toISOString().slice(0, 10),
        vehicles: [...vehicleTrails.entries()].map(([id, trail]) => ({
          vehicleId: id,
          positions: trail,
        })),
      });
    }

    if (view === "headways") {
      const trips = await prisma.tripLog.findMany({
        where: { route, date: { gte: fromDate } },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true, directionId: true },
      });

      // Compute headways per direction
      const byDirection = new Map<number, Date[]>();
      for (const t of trips) {
        if (!t.startedAt) continue;
        const dir = t.directionId ?? 0;
        if (!byDirection.has(dir)) byDirection.set(dir, []);
        byDirection.get(dir)!.push(t.startedAt);
      }

      const headways: number[] = [];
      for (const [, times] of byDirection) {
        const sorted = times.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < sorted.length; i++) {
          const h = (sorted[i].getTime() - sorted[i - 1].getTime()) / 1000;
          if (h > 0 && h < 7200) headways.push(h); // cap at 2h
        }
      }

      // Build distribution (2-minute buckets)
      const buckets = new Map<number, number>();
      for (const h of headways) {
        const bucket = Math.floor(h / 120) * 2; // 2-min buckets
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      }

      return NextResponse.json({
        route,
        period,
        headways: [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([minutes, count]) => ({ minutes, count })),
        totalHeadways: headways.length,
        avgHeadwayMins: headways.length > 0
          ? Math.round(
              (headways.reduce((a: number, b: number) => a + b, 0) / headways.length / 60) * 10
            ) / 10
          : null,
      });
    }

    if (view === "runtimes") {
      const trips = await prisma.tripLog.findMany({
        where: {
          route,
          date: { gte: fromDate },
          runtimeSecs: { gt: 60 },
        },
        select: { runtimeSecs: true },
      });

      const runtimes = trips
        .map((t) => t.runtimeSecs!)
        .filter((r) => r > 0);

      // Build distribution (5-minute buckets)
      const buckets = new Map<number, number>();
      for (const r of runtimes) {
        const bucket = Math.floor(r / 300) * 5; // 5-min buckets
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      }

      return NextResponse.json({
        route,
        period,
        runtimes: [...buckets.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([minutes, count]) => ({ minutes, count })),
        totalTrips: runtimes.length,
        avgRuntimeMins: runtimes.length > 0
          ? Math.round(
              (runtimes.reduce((a, b) => a + b, 0) / runtimes.length / 60) * 10
            ) / 10
          : null,
        medianRuntimeMins: runtimes.length > 0
          ? Math.round(
              ([...runtimes].sort((a, b) => a - b)[
                Math.floor(runtimes.length / 2)
              ] /
                60) *
                10
            ) / 10
          : null,
      });
    }

    return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
  } catch (error) {
    console.error("Line analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch line analytics" },
      { status: 500 }
    );
  }
}
