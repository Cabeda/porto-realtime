/**
 * API: Bottleneck rankings for heatmap page (#69)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";

const CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" };

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
  const filter = parseDateFilter(period || "7d", dateParam);

  try {
    let hourWhere: object;
    let periodLabel: string;

    if (filter.mode === "date") {
      const dayStart = new Date(filter.dateStr + "T00:00:00Z");
      const dayEnd = new Date(filter.dateStr + "T23:59:59.999Z");
      hourWhere = { hourStart: { gte: dayStart, lte: dayEnd } };
      periodLabel = filter.dateStr;
    } else if (filter.mode === "period") {
      hourWhere = { hourStart: { gte: filter.fromDate } };
      periodLabel = filter.period;
    } else {
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 7);
      fromDate.setUTCHours(0, 0, 0, 0);
      hourWhere = { hourStart: { gte: fromDate } };
      periodLabel = "7d";
    }

    // Get segment speeds
    const speeds = await prisma.segmentSpeedHourly.findMany({
      where: hourWhere,
    });

    // Aggregate per segment
    const segAgg = new Map<
      string,
      {
        route: string;
        allSpeeds: number[];
        peakSpeeds: number[];
        offPeakSpeeds: number[];
        samples: number;
      }
    >();

    for (const s of speeds) {
      if (s.avgSpeed === null) continue;
      if (!segAgg.has(s.segmentId)) {
        segAgg.set(s.segmentId, {
          route: s.route,
          allSpeeds: [],
          peakSpeeds: [],
          offPeakSpeeds: [],
          samples: 0,
        });
      }
      const agg = segAgg.get(s.segmentId)!;
      agg.allSpeeds.push(s.avgSpeed);
      agg.samples += s.sampleCount;

      const hour = s.hourStart.getUTCHours();
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        agg.peakSpeeds.push(s.avgSpeed);
      } else {
        agg.offPeakSpeeds.push(s.avgSpeed);
      }
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    // Get segment geometries
    const segments = await prisma.routeSegment.findMany();
    const segMap = new Map(segments.map((s) => [s.id, s]));

    const bottlenecks = [...segAgg.entries()]
      .map(([segId, agg]) => {
        const seg = segMap.get(segId);
        const avgSpeed = avg(agg.allSpeeds);
        const peakSpeed = avg(agg.peakSpeeds);
        const offPeakSpeed = avg(agg.offPeakSpeeds);
        const delta =
          peakSpeed !== null && offPeakSpeed !== null && offPeakSpeed > 0
            ? Math.round(((peakSpeed - offPeakSpeed) / offPeakSpeed) * 100)
            : null;

        return {
          segmentId: segId,
          route: agg.route,
          geometry: seg?.geometry ?? null,
          avgSpeed: avgSpeed !== null ? Math.round(avgSpeed * 10) / 10 : null,
          peakSpeed: peakSpeed !== null ? Math.round(peakSpeed * 10) / 10 : null,
          offPeakSpeed: offPeakSpeed !== null ? Math.round(offPeakSpeed * 10) / 10 : null,
          deltaPct: delta,
          samples: agg.samples,
        };
      })
      .filter((b) => b.avgSpeed !== null && b.samples >= 10)
      .sort((a, b) => (a.avgSpeed ?? 99) - (b.avgSpeed ?? 99))
      .slice(0, limit);

    return NextResponse.json({ period: periodLabel, bottlenecks }, { headers: CACHE });
  } catch (error) {
    console.error("Bottlenecks error:", error);
    return NextResponse.json({ error: "Failed to fetch bottlenecks" }, { status: 500 });
  }
}
