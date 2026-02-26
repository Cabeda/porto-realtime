/**
 * API: Speed timeseries for dashboard chart (#68)
 * Supports: period=today|7d|30d or date=YYYY-MM-DD
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";

const CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" };
const NO_CACHE = { "Cache-Control": "no-store" };

function buildHourlyTimeseries(hourly: Map<number, number[]>) {
  const timeseries = [];
  for (let h = 0; h < 24; h++) {
    const speeds = hourly.get(h);
    timeseries.push({
      hour: h,
      label: `${h.toString().padStart(2, "0")}:00`,
      avgSpeed: speeds
        ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
        : null,
      samples: speeds?.length ?? 0,
    });
  }
  return timeseries;
}

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const route = request.nextUrl.searchParams.get("route");
  const filter = parseDateFilter(period, dateParam);

  try {
    if (filter.mode === "today") {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const positions = await prisma.busPositionLog.findMany({
        where: {
          recordedAt: { gte: todayStart },
          speed: { gt: 0 },
          ...(route ? { route } : {}),
        },
        select: { recordedAt: true, speed: true },
      });

      const hourly = new Map<number, number[]>();
      for (const p of positions) {
        const h = p.recordedAt.getUTCHours();
        if (!hourly.has(h)) hourly.set(h, []);
        hourly.get(h)!.push(p.speed!);
      }

      return NextResponse.json(
        { period: "today", timeseries: buildHourlyTimeseries(hourly) },
        { headers: NO_CACHE }
      );
    }

    if (filter.mode === "date") {
      // Try raw positions for this date (if still in DB)
      const dayStart = new Date(filter.dateStr + "T00:00:00Z");
      const dayEnd = new Date(filter.dateStr + "T23:59:59.999Z");

      const positions = await prisma.busPositionLog.findMany({
        where: {
          recordedAt: { gte: dayStart, lte: dayEnd },
          speed: { gt: 0 },
          ...(route ? { route } : {}),
        },
        select: { recordedAt: true, speed: true },
      });

      if (positions.length > 0) {
        const hourly = new Map<number, number[]>();
        for (const p of positions) {
          const h = p.recordedAt.getUTCHours();
          if (!hourly.has(h)) hourly.set(h, []);
          hourly.get(h)!.push(p.speed!);
        }
        return NextResponse.json(
          { period: filter.dateStr, timeseries: buildHourlyTimeseries(hourly) },
          { headers: CACHE }
        );
      }

      // Fall back to SegmentSpeedHourly for this date
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

      return NextResponse.json({ period: filter.dateStr, timeseries }, { headers: CACHE });
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

    return NextResponse.json({ period: filter.period, timeseries }, { headers: CACHE });
  } catch (error) {
    console.error("Speed timeseries error:", error);
    return NextResponse.json({ error: "Failed to fetch speed timeseries" }, { status: 500 });
  }
}
