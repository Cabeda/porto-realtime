/**
 * API: Fleet activity (active vehicles per hour) (#68)
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 *
 * "today" mode reads hourlyFleet from R2 (snapshots/today.json).
 * "date" mode reads from NetworkSummaryDaily (single day).
 * Historical periods (7d, 30d) return daily activeVehicles from NetworkSummaryDaily.
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
  const cacheKey = request.nextUrl.search || "default";

  const cached = memCache.get(cacheKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  const filter = parseDateFilter(period, dateParam);

  try {
    if (filter.mode === "today") {
      const todaySummary = await sf.do(cacheKey, () =>
        getR2Json<TodaySummary>("snapshots/today.json")
      );

      // Build hourly timeseries from today.json
      const timeseries = [];
      for (let h = 0; h < 24; h++) {
        const bucket = todaySummary?.hourlyFleet?.find((b) => b.hour === h);
        timeseries.push({
          hour: h,
          label: `${h.toString().padStart(2, "0")}:00`,
          totalVehicles: bucket?.vehicles ?? 0,
          routes: [],
        });
      }

      const data = { period: "today", timeseries };
      memCache.set(cacheKey, data);
      return NextResponse.json(data, { headers: cacheUntilNextHour() });
    }

    if (filter.mode === "date") {
      const summary = await prisma.networkSummaryDaily.findFirst({
        where: { date: filter.date },
      });

      const data = {
        period: filter.dateStr,
        dailySeries: summary
          ? [{ date: filter.dateStr, activeVehicles: summary.activeVehicles }]
          : [],
      };
      memCache.set(cacheKey, data);
      return NextResponse.json(data, { headers: CACHE });
    }

    // Historical periods: 7d, 30d — daily activeVehicles from NetworkSummaryDaily
    const summaries = await prisma.networkSummaryDaily.findMany({
      where: { date: { gte: filter.fromDate } },
      orderBy: { date: "asc" },
      select: { date: true, activeVehicles: true },
    });

    const data = {
      period: filter.period,
      dailySeries: summaries.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        activeVehicles: s.activeVehicles,
      })),
    };
    memCache.set(cacheKey, data);
    return NextResponse.json(data, { headers: CACHE });
  } catch (error) {
    console.error("Fleet activity error:", error);
    return NextResponse.json({ error: "Failed to fetch fleet activity" }, { status: 500 });
  }
}
