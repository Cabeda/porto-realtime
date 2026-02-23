/**
 * API: Historical trip replay data
 *
 * Returns slim trip records for a given date from TripLog.
 * No R2 reads — all data comes from the pre-aggregated TripLog table.
 * Client interpolates positions along route shapes.
 *
 * GET /api/analytics/replay?date=YYYY-MM-DD&route=
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const CACHE_1DAY = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" };
const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dateParam = searchParams.get("date");
  const route = searchParams.get("route") || undefined;

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: "date param required (YYYY-MM-DD)" }, { status: 400 });
  }

  const dayStart = new Date(dateParam + "T00:00:00Z");
  const dayEnd = new Date(dateParam + "T23:59:59.999Z");
  const isToday = dateParam === new Date().toISOString().slice(0, 10);

  try {
    const trips = await prisma.tripLog.findMany({
      where: {
        date: dayStart,
        ...(route ? { route } : {}),
        startedAt: { not: null },
        endedAt: { not: null },
        runtimeSecs: { gt: 60 },
      },
      select: {
        vehicleId: true,
        vehicleNum: true,
        route: true,
        directionId: true,
        startedAt: true,
        endedAt: true,
        runtimeSecs: true,
        avgSpeed: true,
      },
      orderBy: { startedAt: "asc" },
    });

    // Compute day bounds from actual data for the scrubber
    const starts = trips.map((t) => t.startedAt!.getTime());
    const ends = trips.map((t) => t.endedAt!.getTime());
    const dayStartMs = starts.length > 0 ? Math.min(...starts) : dayStart.getTime();
    const dayEndMs = ends.length > 0 ? Math.max(...ends) : dayEnd.getTime();

    return NextResponse.json(
      {
        date: dateParam,
        dayStartMs,
        dayEndMs,
        trips: trips.map((t) => ({
          v: t.vehicleNum ?? t.vehicleId.split(":").pop() ?? t.vehicleId,
          r: t.route,
          d: t.directionId ?? 0,
          s: t.startedAt!.getTime(),
          e: t.endedAt!.getTime(),
          spd: t.avgSpeed ?? null,
        })),
      },
      { headers: isToday ? NO_CACHE : CACHE_1DAY }
    );
  } catch (err) {
    console.error("Replay API error:", err);
    return NextResponse.json({ error: "Failed to fetch replay data" }, { status: 500 });
  }
}
