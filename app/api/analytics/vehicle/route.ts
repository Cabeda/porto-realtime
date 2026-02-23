/**
 * API: Vehicle analytics
 * Per-vehicle performance: trips operated, routes, runtime adherence, speed.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateFilter } from "@/lib/analytics/date-filter";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" };
const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const vehicle = request.nextUrl.searchParams.get("vehicle");
  const period = request.nextUrl.searchParams.get("period");
  const dateParam = request.nextUrl.searchParams.get("date");
  const view = request.nextUrl.searchParams.get("view") || "fleet";

  try {
    const filter = parseDateFilter(period || "7d", dateParam);

    let dateWhere: object;
    let periodLabel: string;

    if (filter.mode === "date") {
      dateWhere = { date: filter.date };
      periodLabel = filter.dateStr;
    } else if (filter.mode === "period") {
      dateWhere = { date: { gte: filter.fromDate } };
      periodLabel = filter.period;
    } else {
      const fromDate = new Date();
      fromDate.setUTCDate(fromDate.getUTCDate() - 1);
      fromDate.setUTCHours(0, 0, 0, 0);
      dateWhere = { date: { gte: fromDate } };
      periodLabel = "today";
    }

    // Fleet overview — all vehicles active in the period
    if (view === "fleet") {
      const trips = await prisma.tripLog.findMany({
        where: { vehicleNum: { not: null }, runtimeSecs: { gt: 60 }, ...dateWhere },
        select: {
          vehicleNum: true,
          route: true,
          runtimeSecs: true,
          scheduledRuntimeSecs: true,
          avgSpeed: true,
          commercialSpeed: true,
        },
      });

      const byVehicle = new Map<string, {
        trips: number;
        routes: Set<string>;
        speeds: number[];
        adherence: number[];
      }>();

      for (const t of trips) {
        const v = t.vehicleNum!;
        if (!byVehicle.has(v)) byVehicle.set(v, { trips: 0, routes: new Set(), speeds: [], adherence: [] });
        const e = byVehicle.get(v)!;
        e.trips++;
        e.routes.add(t.route);
        const s = t.commercialSpeed ?? t.avgSpeed;
        if (s && s > 0) e.speeds.push(s);
        if (t.runtimeSecs && t.scheduledRuntimeSecs && t.scheduledRuntimeSecs > 0) {
          e.adherence.push((t.runtimeSecs / t.scheduledRuntimeSecs) * 100);
        }
      }

      const fleet = [...byVehicle.entries()]
        .map(([vehicleNum, d]) => ({
          vehicleNum,
          trips: d.trips,
          routes: [...d.routes].sort(),
          avgSpeed: d.speeds.length > 0
            ? Math.round((d.speeds.reduce((a, b) => a + b, 0) / d.speeds.length) * 10) / 10
            : null,
          avgAdherence: d.adherence.length > 0
            ? Math.round((d.adherence.reduce((a, b) => a + b, 0) / d.adherence.length) * 10) / 10
            : null,
        }))
        .sort((a, b) => b.trips - a.trips);

      return NextResponse.json(
        { period: periodLabel, totalVehicles: fleet.length, fleet },
        { headers: filter.mode === "today" ? NO_CACHE : CACHE }
      );
    }

    if (!vehicle) {
      return NextResponse.json({ error: "vehicle parameter required" }, { status: 400 });
    }

    const baseWhere = { vehicleNum: vehicle, ...dateWhere };

    if (view === "summary") {
      const trips = await prisma.tripLog.findMany({
        where: { ...baseWhere, runtimeSecs: { gt: 60 } },
        orderBy: { startedAt: "asc" },
        select: {
          date: true,
          route: true,
          directionId: true,
          startedAt: true,
          endedAt: true,
          runtimeSecs: true,
          scheduledRuntimeSecs: true,
          avgSpeed: true,
          commercialSpeed: true,
        },
      });

      const totalTrips = trips.length;
      const routesOperated = [...new Set(trips.map((t) => t.route))].sort();

      const speeds = trips.map((t) => t.commercialSpeed ?? t.avgSpeed).filter((s): s is number => s !== null && s > 0);
      const avgSpeed = speeds.length > 0 ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10 : null;

      // Runtime adherence: actual / scheduled * 100 (100% = on time, >100% = slower)
      const adherenceValues = trips
        .filter((t) => t.runtimeSecs && t.scheduledRuntimeSecs && t.scheduledRuntimeSecs > 0)
        .map((t) => (t.runtimeSecs! / t.scheduledRuntimeSecs!) * 100);
      const avgAdherence = adherenceValues.length > 0
        ? Math.round((adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length) * 10) / 10
        : null;

      // Daily breakdown
      const byDate = new Map<string, { trips: number; speed: number[]; adherence: number[] }>();
      for (const t of trips) {
        const d = t.date.toISOString().slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, { trips: 0, speed: [], adherence: [] });
        const entry = byDate.get(d)!;
        entry.trips++;
        const s = t.commercialSpeed ?? t.avgSpeed;
        if (s && s > 0) entry.speed.push(s);
        if (t.runtimeSecs && t.scheduledRuntimeSecs && t.scheduledRuntimeSecs > 0) {
          entry.adherence.push((t.runtimeSecs / t.scheduledRuntimeSecs) * 100);
        }
      }

      const dailyPerformance = [...byDate.entries()].map(([date, d]) => ({
        date,
        trips: d.trips,
        speed: d.speed.length > 0 ? Math.round((d.speed.reduce((a, b) => a + b, 0) / d.speed.length) * 10) / 10 : null,
        adherence: d.adherence.length > 0 ? Math.round((d.adherence.reduce((a, b) => a + b, 0) / d.adherence.length) * 10) / 10 : null,
      }));

      return NextResponse.json({
        vehicle,
        period: periodLabel,
        totalTrips,
        routesOperated,
        avgSpeed,
        avgRuntimeAdherence: avgAdherence,
        dailyPerformance,
      }, { headers: filter.mode === "today" ? NO_CACHE : CACHE });
    }

    if (view === "trips") {
      const trips = await prisma.tripLog.findMany({
        where: { ...baseWhere, runtimeSecs: { gt: 60 } },
        orderBy: { startedAt: "desc" },
        take: 100,
        select: {
          date: true,
          route: true,
          directionId: true,
          startedAt: true,
          endedAt: true,
          runtimeSecs: true,
          scheduledRuntimeSecs: true,
          avgSpeed: true,
          commercialSpeed: true,
        },
      });

      return NextResponse.json({
        vehicle,
        period: periodLabel,
        trips: trips.map((t) => ({
          date: t.date.toISOString().slice(0, 10),
          route: t.route,
          directionId: t.directionId,
          startedAt: t.startedAt?.toISOString() ?? null,
          endedAt: t.endedAt?.toISOString() ?? null,
          runtimeMins: t.runtimeSecs ? Math.round(t.runtimeSecs / 60) : null,
          scheduledRuntimeMins: t.scheduledRuntimeSecs ? Math.round(t.scheduledRuntimeSecs / 60) : null,
          adherencePct: t.runtimeSecs && t.scheduledRuntimeSecs && t.scheduledRuntimeSecs > 0
            ? Math.round((t.runtimeSecs / t.scheduledRuntimeSecs) * 1000) / 10
            : null,
          speed: t.commercialSpeed ?? t.avgSpeed,
        })),
      }, { headers: filter.mode === "today" ? NO_CACHE : CACHE });
    }

    return NextResponse.json({ error: "Invalid view parameter" }, { status: 400 });
  } catch (error) {
    console.error("Vehicle analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch vehicle analytics" }, { status: 500 });
  }
}
