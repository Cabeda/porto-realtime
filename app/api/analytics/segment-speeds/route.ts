/**
 * API: Segment speeds for heatmap and dashboard maps (#69)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "today";
  const route = request.nextUrl.searchParams.get("route");
  const hour = request.nextUrl.searchParams.get("hour"); // 0-23

  try {
    const now = new Date();

    if (period === "today") {
      // Live segment speeds from today's raw positions
      // Group by route segment using approximate snapping
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      // Get all segments with their geometry
      const segments = await prisma.routeSegment.findMany({
        where: route ? { route } : undefined,
      });

      if (segments.length === 0) {
        return NextResponse.json({ segments: [], period });
      }

      // Return segments with latest aggregated speeds if available
      const latestHour = new Date(now);
      latestHour.setUTCMinutes(0, 0, 0);
      latestHour.setUTCHours(latestHour.getUTCHours() - 1);

      const speeds = await prisma.segmentSpeedHourly.findMany({
        where: {
          hourStart: { gte: todayStart },
          ...(route ? { route } : {}),
          ...(hour ? { hourStart: { equals: new Date(todayStart.getTime() + parseInt(hour) * 3600000) } } : {}),
        },
      });

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
            p10Speed: speed?.p10Speed ?? null,
            p90Speed: speed?.p90Speed ?? null,
            sampleCount: speed?.sampleCount ?? 0,
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

    // Aggregate segment speeds across the period
    const speeds = await prisma.segmentSpeedHourly.findMany({
      where: {
        hourStart: { gte: fromDate },
        ...(route ? { route } : {}),
      },
    });

    // Group by segment and compute period averages
    const segAgg = new Map<
      string,
      { speeds: number[]; samples: number }
    >();
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
                (agg.speeds.reduce((a, b) => a + b, 0) / agg.speeds.length) *
                  10
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
