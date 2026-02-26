/**
 * API: Stop-level headway irregularity (#76)
 * GET /api/analytics/stop-headways?route=205&direction=0&period=7d
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";

const CACHE = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
};

export async function GET(request: NextRequest) {
  const route = request.nextUrl.searchParams.get("route");
  const directionParam = request.nextUrl.searchParams.get("direction");
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");

  if (!route) {
    return NextResponse.json({ error: "route parameter required" }, { status: 400 });
  }

  const directionId =
    directionParam !== null && directionParam !== "" ? parseInt(directionParam) : null;

  try {
    const filter = parseDateFilter(period || "7d", dateParam);

    let dateWhere: object;
    if (filter.mode === "date") {
      dateWhere = { date: filter.date };
    } else if (filter.mode === "period") {
      dateWhere = { date: { gte: filter.fromDate } };
    } else {
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 1);
      fromDate.setUTCHours(0, 0, 0, 0);
      dateWhere = { date: { gte: fromDate } };
    }

    const rows = await prisma.stopHeadwayDaily.findMany({
      where: {
        route,
        ...(directionId !== null ? { directionId } : {}),
        ...dateWhere,
      },
      orderBy: [{ stopSequence: "asc" }, { date: "asc" }],
    });

    // Aggregate across days: average per stop
    const byStop = new Map<
      string,
      {
        stopId: string;
        stopName: string | null;
        stopSequence: number;
        avgHeadways: number[];
        stdDevs: number[];
        totalObs: number;
      }
    >();

    for (const row of rows) {
      const key = `${row.stopId}:${row.directionId ?? "x"}`;
      if (!byStop.has(key)) {
        byStop.set(key, {
          stopId: row.stopId,
          stopName: row.stopName,
          stopSequence: row.stopSequence,
          avgHeadways: [],
          stdDevs: [],
          totalObs: 0,
        });
      }
      const entry = byStop.get(key)!;
      if (row.avgHeadwaySecs !== null) entry.avgHeadways.push(row.avgHeadwaySecs);
      if (row.headwayStdDev !== null) entry.stdDevs.push(row.headwayStdDev);
      entry.totalObs += row.observations;
    }

    const stops = Array.from(byStop.values())
      .sort((a, b) => a.stopSequence - b.stopSequence)
      .map((s) => ({
        stopId: s.stopId,
        stopName: s.stopName,
        stopSequence: s.stopSequence,
        avgHeadwaySecs:
          s.avgHeadways.length > 0
            ? Math.round(s.avgHeadways.reduce((a, b) => a + b, 0) / s.avgHeadways.length)
            : null,
        headwayStdDev:
          s.stdDevs.length > 0
            ? Math.round((s.stdDevs.reduce((a, b) => a + b, 0) / s.stdDevs.length) * 10) / 10
            : null,
        observations: s.totalObs,
      }));

    return NextResponse.json({ route, directionId, stops }, { headers: CACHE });
  } catch (err) {
    console.error("[stop-headways]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
