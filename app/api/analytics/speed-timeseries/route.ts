/**
 * API: Speed timeseries for dashboard chart (#68)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "today";

  try {
    const now = new Date();

    if (period === "today") {
      // Hourly average speed from today's raw positions
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const positions = await prisma.busPositionLog.findMany({
        where: {
          recordedAt: { gte: todayStart },
          speed: { gt: 0 },
        },
        select: { recordedAt: true, speed: true },
      });

      // Group by hour
      const hourly = new Map<number, number[]>();
      for (const p of positions) {
        const h = p.recordedAt.getUTCHours();
        if (!hourly.has(h)) hourly.set(h, []);
        hourly.get(h)!.push(p.speed!);
      }

      const timeseries = [];
      for (let h = 0; h < 24; h++) {
        const speeds = hourly.get(h);
        timeseries.push({
          hour: h,
          label: `${h.toString().padStart(2, "0")}:00`,
          avgSpeed: speeds
            ? Math.round(
                (speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10
              ) / 10
            : null,
          samples: speeds?.length ?? 0,
        });
      }

      return NextResponse.json({ period, timeseries });
    }

    // Historical: aggregate from segment speed hourly
    const days = period === "7d" ? 7 : 30;
    const fromDate = new Date(now);
    fromDate.setUTCDate(fromDate.getUTCDate() - days);
    fromDate.setUTCHours(0, 0, 0, 0);

    const speeds = await prisma.segmentSpeedHourly.findMany({
      where: { hourStart: { gte: fromDate } },
      select: { hourStart: true, avgSpeed: true, sampleCount: true },
    });

    // Group by hour of day
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
        avgSpeed: agg && agg.count > 0
          ? Math.round((agg.total / agg.count) * 10) / 10
          : null,
        samples: agg?.count ?? 0,
      });
    }

    return NextResponse.json({ period, timeseries });
  } catch (error) {
    console.error("Speed timeseries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch speed timeseries" },
      { status: 500 }
    );
  }
}
