/**
 * API: Segment speeds for heatmap and dashboard maps (#69)
 *
 * For "today": computes live average speed per route from raw BusPositionLog,
 * then maps it onto route segments for visualization.
 * For historical periods: reads from pre-aggregated SegmentSpeedHourly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "today";
  const route = request.nextUrl.searchParams.get("route");

  try {
    const now = new Date();

    if (period === "today") {
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const segments = await prisma.routeSegment.findMany({
        where: route ? { route } : undefined,
      });

      if (segments.length === 0) {
        return NextResponse.json({ segments: [], period });
      }

      // First try pre-aggregated hourly data
      const speeds = await prisma.segmentSpeedHourly.findMany({
        where: {
          hourStart: { gte: todayStart },
          ...(route ? { route } : {}),
        },
      });

      if (speeds.length > 0) {
        // Use pre-aggregated data
        const speedMap = new Map(speeds.map((s) => [s.segmentId, s]));
        return NextResponse.json({
          period,
          segments: segments.map((seg) => {
            const speed = speedMap.get(seg.id);
            return {
              id: seg.id,
              route: seg.route,
              directionId: seg.directionId,
              geometry: seg.geometry,
              lengthM: seg.lengthM,
              avgSpeed: speed?.avgSpeed ?? null,
              medianSpeed: speed?.medianSpeed ?? null,
              sampleCount: speed?.sampleCount ?? 0,
            };
          }),
        });
      }

      // Fallback: compute live average speed per route from raw positions
      const routeSpeeds = await prisma.busPositionLog.groupBy({
        by: ["route"],
        where: {
          recordedAt: { gte: todayStart },
          speed: { gt: 0 },
          route: route ? route : { not: null },
        },
        _avg: { speed: true },
        _count: { speed: true },
      });

      const routeSpeedMap = new Map(
        routeSpeeds
          .filter((r) => r.route !== null)
          .map((r) => [
            r.route!,
            {
              avgSpeed: r._avg.speed ? Math.round(r._avg.speed * 10) / 10 : null,
              count: r._count.speed,
            },
          ])
      );

      return NextResponse.json({
        period,
        source: "live",
        segments: segments.map((seg) => {
          const rs = routeSpeedMap.get(seg.route);
          return {
            id: seg.id,
            route: seg.route,
            directionId: seg.directionId,
            geometry: seg.geometry,
            lengthM: seg.lengthM,
            avgSpeed: rs?.avgSpeed ?? null,
            medianSpeed: null,
            sampleCount: rs?.count ?? 0,
          };
        }),
      });
    }

    // Historical periods
    const days = period === "7d" ? 7 : 30;
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    fromDate.setUTCHours(0, 0, 0, 0);

    const segments = await prisma.routeSegment.findMany({
      where: route ? { route } : undefined,
    });

    const speeds = await prisma.segmentSpeedHourly.findMany({
      where: {
        hourStart: { gte: fromDate },
        ...(route ? { route } : {}),
      },
    });

    const segAgg = new Map<string, { speeds: number[]; samples: number }>();
    for (const s of speeds) {
      if (s.avgSpeed === null) continue;
      if (!segAgg.has(s.segmentId)) {
        segAgg.set(s.segmentId, { speeds: [], samples: 0 });
      }
      const agg = segAgg.get(s.segmentId)!;
      agg.speeds.push(s.avgSpeed);
      agg.samples += s.sampleCount;
    }

    return NextResponse.json({
      period,
      segments: segments.map((seg) => {
        const agg = segAgg.get(seg.id);
        const avgSpeed =
          agg && agg.speeds.length > 0
            ? Math.round(
                (agg.speeds.reduce((a, b) => a + b, 0) / agg.speeds.length) * 10
              ) / 10
            : null;
        return {
          id: seg.id,
          route: seg.route,
          directionId: seg.directionId,
          geometry: seg.geometry,
          lengthM: seg.lengthM,
          avgSpeed,
          sampleCount: agg?.samples ?? 0,
        };
      }),
    });
  } catch (error) {
    console.error("Segment speeds error:", error);
    return NextResponse.json(
      { error: "Failed to fetch segment speeds" },
      { status: 500 }
    );
  }
}
