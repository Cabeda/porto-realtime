/**
 * API: Fleet activity (active vehicles per hour) (#68)
 * Supports: period=today or date=YYYY-MM-DD (raw data must exist)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";
import { CACHE_1DAY, cacheUntilNextHour } from "@/lib/analytics/cache";
import { KeyedStaleCache, SingleFlight } from "@/lib/api-fetch";

const CACHE = CACHE_1DAY;
const memCache = new KeyedStaleCache<unknown>(5 * 60 * 1000);
const sf = new SingleFlight(); // 5 minutes

function buildFleetTimeseries(
  positions: { recordedAt: Date; vehicleId: string; route: string | null }[]
) {
  const hourly = new Map<number, Set<string>>();
  const hourlyByRoute = new Map<number, Map<string, Set<string>>>();

  for (const p of positions) {
    const h = p.recordedAt.getUTCHours();

    if (!hourly.has(h)) hourly.set(h, new Set());
    hourly.get(h)!.add(p.vehicleId);

    if (p.route) {
      if (!hourlyByRoute.has(h)) hourlyByRoute.set(h, new Map());
      const routeMap = hourlyByRoute.get(h)!;
      if (!routeMap.has(p.route)) routeMap.set(p.route, new Set());
      routeMap.get(p.route)!.add(p.vehicleId);
    }
  }

  const timeseries = [];
  for (let h = 0; h < 24; h++) {
    const vehicles = hourly.get(h);
    const routes = hourlyByRoute.get(h);

    const routeBreakdown: { route: string; vehicles: number }[] = [];
    if (routes) {
      const sorted = [...routes.entries()]
        .map(([route, vSet]) => ({ route, vehicles: vSet.size }))
        .sort((a, b) => b.vehicles - a.vehicles);
      routeBreakdown.push(...sorted.slice(0, 10));
    }

    timeseries.push({
      hour: h,
      label: `${h.toString().padStart(2, "0")}:00`,
      totalVehicles: vehicles?.size ?? 0,
      routes: routeBreakdown,
    });
  }

  return timeseries;
}

export async function GET(request: NextRequest) {
  const dateParam = request.nextUrl.searchParams.get("date");
  const route = request.nextUrl.searchParams.get("route");

  const filter = parseDateFilter(null, dateParam);
  // Normalize cache key: fleet-activity ignores period, only date matters
  const normalizedKey = filter.mode === "date" ? `date=${filter.dateStr}` : "today";

  const cached = memCache.get(normalizedKey);
  if (cached?.fresh) return NextResponse.json(cached.data);

  try {
    let dayStart: Date;
    let dayEnd: Date;

    if (filter.mode === "date") {
      dayStart = new Date(filter.dateStr + "T00:00:00Z");
      dayEnd = new Date(filter.dateStr + "T23:59:59.999Z");
    } else {
      // Default: today
      dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      dayEnd = new Date();
    }

    const positions = await sf.do(normalizedKey, () =>
      prisma.busPositionLog.findMany({
        where: { recordedAt: { gte: dayStart, lte: dayEnd }, ...(route ? { route } : {}) },
        select: { recordedAt: true, vehicleId: true, route: true },
      })
    );

    const data = {
      period: filter.mode === "date" ? filter.dateStr : "today",
      timeseries: buildFleetTimeseries(positions),
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
