/**
 * API: Fleet activity (active vehicles per hour) (#68)
 * Supports: period=today or date=YYYY-MM-DD
 *
 * "today" mode reads hourlyFleet from R2 (snapshots/today.json) instead of
 * querying BusPositionLog, allowing Neon to idle.
 * "date" mode reads from pre-aggregated NetworkSummaryDaily (no raw data needed).
 */

import { NextResponse, type NextRequest } from "next/server";
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
  const dateParam = request.nextUrl.searchParams.get("date");

  const filter = parseDateFilter(null, dateParam);
  const normalizedKey = filter.mode === "date" ? `date=${filter.dateStr}` : "today";

  const cached = memCache.get(normalizedKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  try {
    const todaySummary = await sf.do(normalizedKey, () =>
      getR2Json<TodaySummary>("snapshots/today.json")
    );

    // Build timeseries from today.json hourlyFleet
    const timeseries = [];
    for (let h = 0; h < 24; h++) {
      const bucket = todaySummary?.hourlyFleet?.find((b) => b.hour === h);
      timeseries.push({
        hour: h,
        label: `${h.toString().padStart(2, "0")}:00`,
        totalVehicles: bucket?.vehicles ?? 0,
        routes: [], // per-route breakdown not available from today.json
      });
    }

    const data = {
      period: filter.mode === "date" ? filter.dateStr : "today",
      timeseries,
    };
    memCache.set(normalizedKey, data);
    return NextResponse.json(data, {
      headers: filter.mode === "date" ? CACHE : cacheUntilNextHour(),
    });
  } catch (error) {
    console.error("Fleet activity error:", error);
    return NextResponse.json({ error: "Failed to fetch fleet activity" }, { status: 500 });
  }
}
