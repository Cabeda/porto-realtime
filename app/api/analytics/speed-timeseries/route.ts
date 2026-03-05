/**
 * API: Speed timeseries for dashboard chart (#68)
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 *
 * "today" mode reads hourlySpeed from R2 (snapshots/today.json).
 * "date" mode reads from pre-aggregated SegmentSpeedHourly.
 * Historical periods (7d, 30d) read from SegmentSpeedHourly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getR2Json } from "@/lib/r2-client";
import { parseDateFilter } from "@/lib/analytics/date-filter";
import { CACHE_1DAY, cacheUntilNextHour } from "@/lib/analytics/cache";
import { KeyedStaleCache, SingleFlight } from "@/lib/api-fetch";

interface TodaySummary {
  updatedAt: string;
  date: string;
  positionsCollected: number;
  activeVehicles: number;
  activeRoutes: number;
  avgSpeed: number | null;
  hourlySpeed: { hour: number; avgSpeed: number | null; samples: number }[];
  hourlyFleet: { hour: number; vehicles: number; routes: number }[];
}

const CACHE = CACHE_1DAY;
const memCache = new KeyedStaleCache<unknown>(5 * 60 * 1000);
const sf = new SingleFlight();

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const route = request.nextUrl.searchParams.get("route");
  const cacheKey = request.nextUrl.search || "default";

  const cached = memCache.get(cacheKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  const filter = parseDateFilter(period, dateParam);

  try {
    if (filter.mode === "today") {
      const todaySummary = await sf.do(cacheKey, () =>
        getR2Json<TodaySummary>("snapshots/today.json")
      );

      const timeseries = [];
      for (let h = 0; h < 24; h++) {
        const bucket = todaySummary?.hourlySpeed?.find((b) => b.hour === h);
        timeseries.push({
          hour: h,
          label: `${h.toString().padStart(2, "0")}:00`,
          avgSpeed: bucket?.avgSpeed ?? null,
          samples: bucket?.samples ?? 0,
        });
      }

      const todayData = { period: "today", timeseries };
      memCache.set(cacheKey, todayData);
      return NextResponse.json(todayData, { headers: cacheUntilNextHour() });
    }

    if (filter.mode === "date") {
      // Read from SegmentSpeedHourly for this date
      const dayStart = new Date(filter.dateStr + "T00:00:00Z");
      const dayEnd = new Date(filter.dateStr + "T23:59:59.999Z");

      const speeds = await prisma.segmentSpeedHourly.findMany({
        where: { hourStart: { gte: dayStart, lte: dayEnd }, ...(route ? { route } : {}) },
        select: { hourStart: true, avgSpeed: true, sampleCount: true },
      });

      const hourly = new Map<number, { total: number; count: number }>();
      for (const s of speeds) {
        if (s.avgSpeed === null) continue;
        const h = s.hourStart.getUTCHours();
        if (!hourly.has(h)) hourly.set(h, { total: 0, count: 0 });
        const agg = hourly.get(h)!;
        agg.total += s.avgSpeed * s.sampleCount;
        agg.count += s.sampleCount;
      }

      const timeseries = [];
      for (let h = 0; h < 24; h++) {
        const agg = hourly.get(h);
        timeseries.push({
          hour: h,
          label: `${h.toString().padStart(2, "0")}:00`,
          avgSpeed: agg && agg.count > 0 ? Math.round((agg.total / agg.count) * 10) / 10 : null,
          samples: agg?.count ?? 0,
        });
      }

      const dateData = { period: filter.dateStr, timeseries };
      memCache.set(cacheKey, dateData);
      return NextResponse.json(dateData, { headers: CACHE });
    }

    // Historical periods: 7d, 30d
    const speeds = await prisma.segmentSpeedHourly.findMany({
      where: { hourStart: { gte: filter.fromDate }, ...(route ? { route } : {}) },
      select: { hourStart: true, avgSpeed: true, sampleCount: true },
    });

    const hourly = new Map<number, { total: number; count: number }>();
    for (const s of speeds) {
      if (s.avgSpeed === null) continue;
      const h = s.hourStart.getUTCHours();
      if (!hourly.has(h)) hourly.set(h, { total: 0, count: 0 });
      const agg = hourly.get(h)!;
      agg.total += s.avgSpeed * s.sampleCount;
      agg.count += s.sampleCount;
    }

    const timeseries = [];
    for (let h = 0; h < 24; h++) {
      const agg = hourly.get(h);
      timeseries.push({
        hour: h,
        label: `${h.toString().padStart(2, "0")}:00`,
        avgSpeed: agg && agg.count > 0 ? Math.round((agg.total / agg.count) * 10) / 10 : null,
        samples: agg?.count ?? 0,
      });
    }

    const periodData = { period: filter.period, timeseries };
    memCache.set(cacheKey, periodData);
    return NextResponse.json(periodData, { headers: CACHE });
  } catch (error) {
    console.error("Speed timeseries error:", error);
    return NextResponse.json({ error: "Failed to fetch speed timeseries" }, { status: 500 });
  }
}
