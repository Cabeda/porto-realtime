/**
 * API: Segment speeds for heatmap and dashboard maps (#69)
 *
 * For "today": reads from pre-aggregated SegmentSpeedHourly if available,
 * otherwise returns null speeds (raw positions are in R2, not Postgres).
 * For historical periods: reads from pre-aggregated SegmentSpeedHourly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";
import { CACHE_1DAY, cacheFor } from "@/lib/analytics/cache";
import { KeyedStaleCache, SingleFlight } from "@/lib/api-fetch";

const CACHE = CACHE_1DAY;
const memCache = new KeyedStaleCache<unknown>(5 * 60 * 1000);
const sf = new SingleFlight();

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const route = request.nextUrl.searchParams.get("route");
  const hourFrom = request.nextUrl.searchParams.get("hourFrom");
  const hourTo = request.nextUrl.searchParams.get("hourTo");
  const cacheKey = request.nextUrl.search || "default";

  const cached = memCache.get(cacheKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  const filter = parseDateFilter(period, dateParam);

  const hFrom = hourFrom ? parseInt(hourFrom) : null;
  const hTo = hourTo ? parseInt(hourTo) : null;
  function matchesHour(d: Date): boolean {
    if (hFrom === null || hTo === null) return true;
    const h = d.getUTCHours();
    return h >= hFrom && h < hTo;
  }

  try {
    const now = new Date();

    if (filter.mode === "today" || filter.mode === "date") {
      let dayStart: Date;
      let dayEnd: Date;
      let periodLabel: string;

      if (filter.mode === "date") {
        dayStart = new Date(filter.dateStr + "T00:00:00Z");
        dayEnd = new Date(filter.dateStr + "T23:59:59.999Z");
        periodLabel = filter.dateStr;
      } else {
        dayStart = new Date(now);
        dayStart.setUTCHours(0, 0, 0, 0);
        dayEnd = now;
        periodLabel = "today";
      }

      const segments = await prisma.routeSegment.findMany({
        where: route ? { route } : undefined,
      });

      if (segments.length === 0) {
        return NextResponse.json(
          { segments: [], period: periodLabel },
          { headers: filter.mode === "today" ? cacheFor(300) : CACHE }
        );
      }
      // First try pre-aggregated hourly data
      const rawSpeeds = await sf.do(cacheKey + ":hourly", () =>
        prisma.segmentSpeedHourly.findMany({
          where: {
            hourStart: { gte: dayStart, lte: dayEnd },
            ...(route ? { route } : {}),
          },
        })
      );
      const speeds = rawSpeeds.filter((s) => matchesHour(s.hourStart));

      if (speeds.length > 0) {
        // Aggregate across filtered hours per segment
        const segAgg = new Map<string, { speeds: number[]; samples: number }>();
        for (const s of speeds) {
          if (s.avgSpeed === null) continue;
          if (!segAgg.has(s.segmentId)) segAgg.set(s.segmentId, { speeds: [], samples: 0 });
          const a = segAgg.get(s.segmentId)!;
          a.speeds.push(s.avgSpeed);
          a.samples += s.sampleCount;
        }
        const aggData = {
          period: periodLabel,
          segments: segments.map((seg) => {
            const a = segAgg.get(seg.id);
            const avgSpeed =
              a && a.speeds.length > 0
                ? Math.round((a.speeds.reduce((x, y) => x + y, 0) / a.speeds.length) * 10) / 10
                : null;
            return {
              id: seg.id,
              route: seg.route,
              directionId: seg.directionId,
              geometry: seg.geometry,
              lengthM: seg.lengthM,
              avgSpeed,
              medianSpeed: null,
              sampleCount: a?.samples ?? 0,
            };
          }),
        };
        memCache.set(cacheKey, aggData);
        return NextResponse.json(aggData, {
          headers: filter.mode === "today" ? cacheFor(300) : CACHE,
        });
      }

      // No pre-aggregated data yet — return segments with null speeds
      const emptyData = {
        period: periodLabel,
        source: "pending",
        segments: segments.map((seg) => ({
          id: seg.id,
          route: seg.route,
          directionId: seg.directionId,
          geometry: seg.geometry,
          lengthM: seg.lengthM,
          avgSpeed: null,
          medianSpeed: null,
          sampleCount: 0,
        })),
      };
      memCache.set(cacheKey, emptyData);
      return NextResponse.json(emptyData, {
        headers: filter.mode === "today" ? cacheFor(300) : CACHE,
      });
    }

    // Historical periods (7d, 30d) — filter.mode === "period"
    const segments = await prisma.routeSegment.findMany({
      where: route ? { route } : undefined,
    });

    const allSpeeds = await prisma.segmentSpeedHourly.findMany({
      where: {
        hourStart: { gte: filter.fromDate },
        ...(route ? { route } : {}),
      },
    });
    const speeds = allSpeeds.filter((s) => matchesHour(s.hourStart));

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

    const historicalData = {
      period: filter.period,
      segments: segments.map((seg) => {
        const agg = segAgg.get(seg.id);
        const avgSpeed =
          agg && agg.speeds.length > 0
            ? Math.round((agg.speeds.reduce((a, b) => a + b, 0) / agg.speeds.length) * 10) / 10
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
    };
    memCache.set(cacheKey, historicalData);
    return NextResponse.json(historicalData, { headers: CACHE });
  } catch (error) {
    console.error("Segment speeds error:", error);
    return NextResponse.json({ error: "Failed to fetch segment speeds" }, { status: 500 });
  }
}
