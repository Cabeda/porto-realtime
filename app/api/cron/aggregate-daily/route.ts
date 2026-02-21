/**
 * Cron job: Daily aggregation pipeline (#67)
 *
 * Runs at 03:00 UTC. Processes the previous day's raw position data into:
 * 1. Trip logs (reconstructed trips)
 * 2. Segment speed hourly aggregates
 * 3. Route performance daily summaries
 * 4. Network summary
 *
 * Authenticated via CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  reconstructTrips,
  computeHeadwayMetrics,
  percentile,
} from "@/lib/analytics/metrics";
import { snapToSegment, type SegmentDef } from "@/lib/analytics/segments";

export const maxDuration = 60; // Cron jobs run on Fly.io; this route is a manual trigger only

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // Process yesterday's data
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  const dateStr = yesterday.toISOString().slice(0, 10);
  console.log(`Aggregation starting for ${dateStr}`);

  try {
    // 1. Fetch all positions for yesterday
    const positions = await prisma.busPositionLog.findMany({
      where: {
        recordedAt: { gte: yesterday, lt: today },
        route: { not: null },
      },
      orderBy: { recordedAt: "asc" },
    });

    if (positions.length === 0) {
      console.log(`No positions found for ${dateStr}`);
      return NextResponse.json({ date: dateStr, positions: 0, trips: 0 });
    }

    console.log(`Processing ${positions.length} positions for ${dateStr}`);

    // 2. Group positions by vehicle + route + direction
    const groups = new Map<
      string,
      typeof positions
    >();
    for (const pos of positions) {
      const key = `${pos.vehicleId}:${pos.route}:${pos.directionId ?? "x"}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pos);
    }

    // 3. Reconstruct trips
    const allTrips: ReturnType<typeof reconstructTrips> = [];
    for (const [, groupPositions] of groups) {
      const points = groupPositions.map((p) => ({
        recordedAt: p.recordedAt,
        vehicleId: p.vehicleId,
        vehicleNum: p.vehicleNum,
        route: p.route!,
        tripId: p.tripId,
        directionId: p.directionId,
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
      }));
      const trips = reconstructTrips(points);
      allTrips.push(...trips);
    }

    // 4. Store trip logs
    if (allTrips.length > 0) {
      // Delete existing trips for this date (idempotent re-runs)
      await prisma.tripLog.deleteMany({
        where: { date: yesterday },
      });

      await prisma.tripLog.createMany({
        data: allTrips.map((t) => ({
          date: yesterday,
          vehicleId: t.vehicleId,
          vehicleNum: t.vehicleNum,
          route: t.route,
          tripId: t.tripId,
          directionId: t.directionId,
          startedAt: t.startedAt,
          endedAt: t.endedAt,
          runtimeSecs: t.runtimeSecs,
          positions: t.positions,
          avgSpeed: t.avgSpeed,
        })),
      });
    }

    console.log(`Reconstructed ${allTrips.length} trips`);

    // 5. Segment speed aggregation
    const segments = await prisma.routeSegment.findMany();
    if (segments.length > 0) {
      const segDefs: SegmentDef[] = segments.map((s) => ({
        id: s.id,
        route: s.route,
        directionId: s.directionId,
        segmentIndex: s.segmentIndex,
        startLat: s.startLat,
        startLon: s.startLon,
        endLat: s.endLat,
        endLon: s.endLon,
        midLat: s.midLat,
        midLon: s.midLon,
        lengthM: s.lengthM,
        geometry: s.geometry as SegmentDef["geometry"],
      }));

      // Group positions by hour and segment
      const hourlySegmentSpeeds = new Map<string, number[]>(); // "segId:hourISO" -> speeds

      for (const pos of positions) {
        if (!pos.route || pos.speed === null || pos.speed <= 0) continue;

        const segId = snapToSegment(
          pos.lat,
          pos.lon,
          pos.route,
          pos.directionId,
          segDefs
        );
        if (!segId) continue;

        const hour = new Date(pos.recordedAt);
        hour.setUTCMinutes(0, 0, 0);
        const key = `${segId}:${hour.toISOString()}`;

        if (!hourlySegmentSpeeds.has(key)) hourlySegmentSpeeds.set(key, []);
        hourlySegmentSpeeds.get(key)!.push(pos.speed);
      }

      // Delete existing segment speeds for this date
      await prisma.segmentSpeedHourly.deleteMany({
        where: {
          hourStart: { gte: yesterday, lt: today },
        },
      });

      // Insert segment speed aggregates
      const segSpeedRows = [];
      for (const [key, speeds] of hourlySegmentSpeeds) {
        if (speeds.length < 2) continue;
        const [segId, hourISO] = key.split(/:(.+)/);
        const seg = segDefs.find((s) => s.id === segId);
        if (!seg) continue;

        segSpeedRows.push({
          segmentId: segId,
          route: seg.route,
          directionId: seg.directionId,
          hourStart: new Date(hourISO),
          avgSpeed: Math.round((speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length) * 10) / 10,
          medianSpeed: Math.round(percentile(speeds, 50) * 10) / 10,
          p10Speed: Math.round(percentile(speeds, 10) * 10) / 10,
          p90Speed: Math.round(percentile(speeds, 90) * 10) / 10,
          sampleCount: speeds.length,
        });
      }

      if (segSpeedRows.length > 0) {
        // Batch insert in chunks to avoid query size limits
        for (let i = 0; i < segSpeedRows.length; i += 500) {
          await prisma.segmentSpeedHourly.createMany({
            data: segSpeedRows.slice(i, i + 500),
          });
        }
      }

      console.log(`Computed ${segSpeedRows.length} segment speed aggregates`);
    }

    // 6. Route performance daily
    const routeTrips = new Map<string, typeof allTrips>();
    for (const trip of allTrips) {
      const key = `${trip.route}:${trip.directionId ?? "x"}`;
      if (!routeTrips.has(key)) routeTrips.set(key, []);
      routeTrips.get(key)!.push(trip);
    }

    // Delete existing route performance for this date
    await prisma.routePerformanceDaily.deleteMany({
      where: { date: yesterday },
    });

    const routePerfRows = [];
    for (const [key, trips] of routeTrips) {
      const [route, dirStr] = key.split(":");
      const directionId = dirStr === "x" ? null : parseInt(dirStr);

      const startTimes = trips
        .map((t) => t.startedAt.getTime())
        .sort((a, b) => a - b);

      const headwayMetrics = computeHeadwayMetrics(startTimes, null);

      const runtimes = trips
        .filter((t) => t.runtimeSecs > 60)
        .map((t) => t.runtimeSecs);
      const avgRuntime =
        runtimes.length > 0
          ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length
          : null;

      const speeds = trips
        .filter((t) => t.avgSpeed > 0)
        .map((t) => t.avgSpeed);
      const avgCommercialSpeed =
        speeds.length > 0
          ? speeds.reduce((a, b) => a + b, 0) / speeds.length
          : null;

      routePerfRows.push({
        date: yesterday,
        route,
        directionId,
        tripsObserved: trips.length,
        avgHeadwaySecs: headwayMetrics?.avgHeadwaySecs ?? null,
        headwayAdherencePct: headwayMetrics?.headwayAdherencePct ?? null,
        excessWaitTimeSecs: headwayMetrics?.excessWaitTimeSecs ?? null,
        avgRuntimeSecs: avgRuntime ? Math.round(avgRuntime) : null,
        avgCommercialSpeed: avgCommercialSpeed
          ? Math.round(avgCommercialSpeed * 10) / 10
          : null,
        bunchingPct: headwayMetrics?.bunchingPct ?? null,
        gappingPct: headwayMetrics?.gappingPct ?? null,
      });
    }

    if (routePerfRows.length > 0) {
      await prisma.routePerformanceDaily.createMany({
        data: routePerfRows,
      });
    }

    console.log(`Computed performance for ${routePerfRows.length} route-directions`);

    // 7. Network summary
    const uniqueVehicles = new Set(positions.map((p) => p.vehicleId)).size;
    const allSpeeds = routePerfRows
      .filter((r) => r.avgCommercialSpeed !== null)
      .map((r) => r.avgCommercialSpeed!);
    const networkAvgSpeed =
      allSpeeds.length > 0
        ? allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length
        : null;

    const allEwt = routePerfRows
      .filter((r) => r.excessWaitTimeSecs !== null)
      .map((r) => r.excessWaitTimeSecs!);
    const networkAvgEwt =
      allEwt.length > 0
        ? allEwt.reduce((a, b) => a + b, 0) / allEwt.length
        : null;

    // Find worst route by EWT
    let worstRoute: string | null = null;
    let worstEwt: number | null = null;
    for (const r of routePerfRows) {
      if (r.excessWaitTimeSecs !== null) {
        if (worstEwt === null || r.excessWaitTimeSecs > worstEwt) {
          worstEwt = r.excessWaitTimeSecs;
          worstRoute = r.route;
        }
      }
    }

    await prisma.networkSummaryDaily.upsert({
      where: { date: yesterday },
      create: {
        date: yesterday,
        activeVehicles: uniqueVehicles,
        totalTrips: allTrips.length,
        avgCommercialSpeed: networkAvgSpeed
          ? Math.round(networkAvgSpeed * 10) / 10
          : null,
        avgExcessWaitTime: networkAvgEwt
          ? Math.round(networkAvgEwt)
          : null,
        worstRoute,
        worstRouteEwt: worstEwt,
        positionsCollected: BigInt(positions.length),
      },
      update: {
        activeVehicles: uniqueVehicles,
        totalTrips: allTrips.length,
        avgCommercialSpeed: networkAvgSpeed
          ? Math.round(networkAvgSpeed * 10) / 10
          : null,
        avgExcessWaitTime: networkAvgEwt
          ? Math.round(networkAvgEwt)
          : null,
        worstRoute,
        worstRouteEwt: worstEwt,
        positionsCollected: BigInt(positions.length),
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(
      `Aggregation complete for ${dateStr}: ${positions.length} positions, ${allTrips.length} trips in ${elapsed}ms`
    );

    return NextResponse.json({
      date: dateStr,
      positions: positions.length,
      trips: allTrips.length,
      routePerformance: routePerfRows.length,
      elapsed: `${elapsed}ms`,
    });
  } catch (error) {
    console.error("Aggregation failed:", error);
    return NextResponse.json(
      { error: "Aggregation failed" },
      { status: 500 }
    );
  }
}
