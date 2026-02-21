/**
 * API: Fleet activity (active vehicles per hour) (#68)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const positions = await prisma.busPositionLog.findMany({
      where: { recordedAt: { gte: todayStart } },
      select: { recordedAt: true, vehicleId: true, route: true },
    });

    // Group by hour → unique vehicles
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

      // Top 10 routes by vehicle count
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

    return NextResponse.json({ timeseries });
  } catch (error) {
    console.error("Fleet activity error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fleet activity" },
      { status: 500 }
    );
  }
}
