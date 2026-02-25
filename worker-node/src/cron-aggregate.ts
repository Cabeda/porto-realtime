/**
 * Cron: Daily aggregation pipeline
 * Processes yesterday's raw position data into trips, segment speeds,
 * route performance, and network summary.
 *
 * Memory-optimised: positions are streamed in chunks rather than loaded
 * all at once. Route stops are pre-indexed by route for O(1) lookup.
 */

import { prisma } from "./prisma.js";
import {
  reconstructTrips,
  computeHeadwayMetrics,
  percentile,
  type PositionPoint,
} from "./metrics.js";
import { snapToSegment, type SegmentDef, haversineM } from "./segments.js";

const CHUNK_SIZE = 5_000;

export async function runAggregateDaily(): Promise<void> {
  const startTime = Date.now();

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const today = new Date(yesterday);
  today.setUTCDate(today.getUTCDate() + 1);

  const dateStr = yesterday.toISOString().slice(0, 10);
  console.log(`[aggregate] Starting for ${dateStr}`);

  // Count positions first to give early feedback
  const totalCount = await prisma.busPositionLog.count({
    where: { recordedAt: { gte: yesterday, lt: today }, route: { not: null } },
  });

  if (totalCount === 0) {
    console.log(`[aggregate] No positions found for ${dateStr}`);
    return;
  }

  console.log(`[aggregate] Processing ${totalCount} positions in chunks of ${CHUNK_SIZE}`);

  // --- Pre-load reference data (small, safe to hold in memory) ---

  const segments = await prisma.routeSegment.findMany();
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

  const routeStops = await prisma.routeStop.findMany();

  // Index route stops by route for O(1) lookup instead of O(n) scan
  const stopsByRoute = new Map<string, typeof routeStops>();
  for (const rs of routeStops) {
    if (!stopsByRoute.has(rs.route)) stopsByRoute.set(rs.route, []);
    stopsByRoute.get(rs.route)!.push(rs);
  }

  // --- Incremental accumulators (never hold all positions at once) ---

  // vehicle+route+direction -> ordered position points (for trip reconstruction)
  const vehicleGroups = new Map<string, PositionPoint[]>();

  // segmentId:hourISO -> speeds[]
  const hourlySegmentSpeeds = new Map<string, number[]>();

  // "route:dir:stopId" -> sorted arrival timestamps (ms)
  const stopArrivals = new Map<string, number[]>();
  // "vehicleId:stopKey" -> last seen ms (dedup)
  const lastSeenAt = new Map<string, number>();

  let totalPositions = 0;
  let cursor: bigint | undefined = undefined;

  // --- Stream positions in chunks ---
  while (true) {
    const chunk: Array<{
      id: bigint;
      recordedAt: Date;
      vehicleId: string;
      vehicleNum: string | null;
      route: string | null;
      tripId: string | null;
      directionId: number | null;
      lat: number;
      lon: number;
      speed: number | null;
      heading: number | null;
    }> = await prisma.busPositionLog.findMany({
      where: { recordedAt: { gte: yesterday, lt: today }, route: { not: null } },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      take: CHUNK_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        recordedAt: true,
        vehicleId: true,
        vehicleNum: true,
        route: true,
        tripId: true,
        directionId: true,
        lat: true,
        lon: true,
        speed: true,
        heading: true,
      },
    });

    if (chunk.length === 0) break;
    cursor = chunk[chunk.length - 1].id;
    totalPositions += chunk.length;

    for (const pos of chunk) {
      const route = pos.route!;

      // Vehicle grouping for trip reconstruction
      const vKey = `${pos.vehicleId}:${route}:${pos.directionId ?? "x"}`;
      if (!vehicleGroups.has(vKey)) vehicleGroups.set(vKey, []);
      vehicleGroups.get(vKey)!.push({
        recordedAt: pos.recordedAt,
        vehicleId: pos.vehicleId,
        vehicleNum: pos.vehicleNum,
        route,
        tripId: pos.tripId,
        directionId: pos.directionId,
        lat: pos.lat,
        lon: pos.lon,
        speed: pos.speed,
      });

      // Segment speed accumulation
      if (pos.speed !== null && pos.speed > 0 && segDefs.length > 0) {
        const segId = snapToSegment(pos.lat, pos.lon, route, pos.directionId, segDefs);
        if (segId) {
          const hour = new Date(pos.recordedAt);
          hour.setUTCMinutes(0, 0, 0);
          const key = `${segId}:${hour.toISOString()}`;
          if (!hourlySegmentSpeeds.has(key)) hourlySegmentSpeeds.set(key, []);
          hourlySegmentSpeeds.get(key)!.push(pos.speed);
        }
      }

      // Stop headway accumulation (only if we have stops for this route)
      const stopsForRoute = stopsByRoute.get(route);
      if (stopsForRoute && stopsForRoute.length > 0) {
        let bestStop: (typeof routeStops)[0] | null = null;
        let bestDist = Infinity;
        for (const rs of stopsForRoute) {
          if (pos.directionId !== null && rs.directionId !== pos.directionId) continue;
          const dist = haversineM(pos.lat, pos.lon, rs.lat, rs.lon);
          if (dist < bestDist && dist <= 80) {
            bestDist = dist;
            bestStop = rs;
          }
        }
        if (bestStop) {
          const stopKey = `${route}:${pos.directionId ?? "x"}:${bestStop.stopId}`;
          const dedupeKey = `${pos.vehicleId}:${stopKey}`;
          const ts = pos.recordedAt.getTime();
          const last = lastSeenAt.get(dedupeKey);
          if (last === undefined || ts - last >= 3 * 60 * 1000) {
            lastSeenAt.set(dedupeKey, ts);
            if (!stopArrivals.has(stopKey)) stopArrivals.set(stopKey, []);
            stopArrivals.get(stopKey)!.push(ts);
          }
        }
      }
    }

    if (chunk.length < CHUNK_SIZE) break;
    console.log(`[aggregate] Processed ${totalPositions}/${totalCount} positions...`);
  }

  console.log(`[aggregate] Streamed ${totalPositions} positions`);

  // --- Trip reconstruction ---
  const allTrips: ReturnType<typeof reconstructTrips> = [];
  for (const [, groupPositions] of vehicleGroups) {
    allTrips.push(...reconstructTrips(groupPositions));
  }
  // Free vehicle groups memory
  vehicleGroups.clear();

  // --- Store trip logs (idempotent) ---
  if (allTrips.length > 0) {
    await prisma.tripLog.deleteMany({ where: { date: yesterday } });
    for (let i = 0; i < allTrips.length; i += 500) {
      await prisma.tripLog.createMany({
        data: allTrips.slice(i, i + 500).map((t) => ({
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
  }
  console.log(`[aggregate] Reconstructed ${allTrips.length} trips`);

  // --- Segment speed aggregation ---
  if (segDefs.length > 0 && hourlySegmentSpeeds.size > 0) {
    await prisma.segmentSpeedHourly.deleteMany({
      where: { hourStart: { gte: yesterday, lt: today } },
    });

    const segSpeedRows = [];
    for (const [key, speeds] of hourlySegmentSpeeds) {
      if (speeds.length < 2) continue;
      const colonIdx = key.indexOf(":");
      const segId = key.slice(0, colonIdx);
      const hourISO = key.slice(colonIdx + 1);
      const seg = segDefs.find((s) => s.id === segId);
      if (!seg) continue;
      segSpeedRows.push({
        segmentId: segId,
        route: seg.route,
        directionId: seg.directionId,
        hourStart: new Date(hourISO),
        avgSpeed: Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10,
        medianSpeed: Math.round(percentile(speeds, 50) * 10) / 10,
        p10Speed: Math.round(percentile(speeds, 10) * 10) / 10,
        p90Speed: Math.round(percentile(speeds, 90) * 10) / 10,
        sampleCount: speeds.length,
      });
    }
    hourlySegmentSpeeds.clear();

    for (let i = 0; i < segSpeedRows.length; i += 500) {
      await prisma.segmentSpeedHourly.createMany({ data: segSpeedRows.slice(i, i + 500) });
    }
    console.log(`[aggregate] Computed ${segSpeedRows.length} segment speed aggregates`);
  }

  // --- Route performance daily ---
  const routeTrips = new Map<string, typeof allTrips>();
  for (const trip of allTrips) {
    const key = `${trip.route}:${trip.directionId ?? "x"}`;
    if (!routeTrips.has(key)) routeTrips.set(key, []);
    routeTrips.get(key)!.push(trip);
  }

  await prisma.routePerformanceDaily.deleteMany({ where: { date: yesterday } });

  const routePerfRows = [];
  for (const [key, trips] of routeTrips) {
    const [route, dirStr] = key.split(":");
    const directionId = dirStr === "x" ? null : parseInt(dirStr);

    const startTimes = trips.map((t) => t.startedAt.getTime()).sort((a, b) => a - b);
    const headwayMetrics = computeHeadwayMetrics(startTimes, null);

    const runtimes = trips.filter((t) => t.runtimeSecs > 60).map((t) => t.runtimeSecs);
    const avgRuntime = runtimes.length > 0
      ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length
      : null;

    const speeds = trips.filter((t) => t.avgSpeed > 0).map((t) => t.avgSpeed);
    const avgCommercialSpeed = speeds.length > 0
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
      avgCommercialSpeed: avgCommercialSpeed ? Math.round(avgCommercialSpeed * 10) / 10 : null,
      bunchingPct: headwayMetrics?.bunchingPct ?? null,
      gappingPct: headwayMetrics?.gappingPct ?? null,
    });
  }

  if (routePerfRows.length > 0) {
    await prisma.routePerformanceDaily.createMany({ data: routePerfRows });
  }
  console.log(`[aggregate] Computed performance for ${routePerfRows.length} route-directions`);

  // --- Stop headway irregularity ---
  if (stopArrivals.size > 0) {
    await prisma.stopHeadwayDaily.deleteMany({ where: { date: yesterday } });

    const headwayRows = [];
    for (const [stopKey, arrivals] of stopArrivals) {
      if (arrivals.length < 3) continue;
      arrivals.sort((a, b) => a - b);

      const headways: number[] = [];
      for (let i = 1; i < arrivals.length; i++) {
        headways.push((arrivals[i] - arrivals[i - 1]) / 1000);
      }

      const avg = headways.reduce((a, b) => a + b, 0) / headways.length;
      const variance = headways.reduce((a, b) => a + (b - avg) ** 2, 0) / headways.length;
      const stdDev = Math.sqrt(variance);

      // stopKey format: "route:dir:stopId" — dir may contain colons if stopId has them,
      // so split on first two colons only
      const firstColon = stopKey.indexOf(":");
      const secondColon = stopKey.indexOf(":", firstColon + 1);
      const route = stopKey.slice(0, firstColon);
      const dirStr = stopKey.slice(firstColon + 1, secondColon);
      const stopId = stopKey.slice(secondColon + 1);
      const directionId = dirStr === "x" ? null : parseInt(dirStr);

      const stopsForRoute = stopsByRoute.get(route) ?? [];
      const rs = stopsForRoute.find(
        (s) => s.stopId === stopId &&
          (directionId === null || s.directionId === directionId)
      );

      headwayRows.push({
        date: yesterday,
        route,
        directionId,
        stopId,
        stopName: rs?.stopName ?? null,
        stopSequence: rs?.stopSequence ?? 0,
        avgHeadwaySecs: Math.round(avg),
        headwayStdDev: Math.round(stdDev * 10) / 10,
        observations: arrivals.length,
      });
    }

    for (let i = 0; i < headwayRows.length; i += 500) {
      await prisma.stopHeadwayDaily.createMany({ data: headwayRows.slice(i, i + 500) });
    }
    console.log(`[aggregate] Computed headway irregularity for ${headwayRows.length} stops`);
  }

  // --- Network summary ---
  const uniqueVehicles = new Set(allTrips.map((t) => t.vehicleId)).size;
  const allSpeeds = routePerfRows.filter((r) => r.avgCommercialSpeed !== null).map((r) => r.avgCommercialSpeed!);
  const networkAvgSpeed = allSpeeds.length > 0
    ? allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length
    : null;

  const allEwt = routePerfRows.filter((r) => r.excessWaitTimeSecs !== null).map((r) => r.excessWaitTimeSecs!);
  const networkAvgEwt = allEwt.length > 0
    ? allEwt.reduce((a, b) => a + b, 0) / allEwt.length
    : null;

  let worstRoute: string | null = null;
  let worstEwt: number | null = null;
  for (const r of routePerfRows) {
    if (r.excessWaitTimeSecs !== null && (worstEwt === null || r.excessWaitTimeSecs > worstEwt)) {
      worstEwt = r.excessWaitTimeSecs;
      worstRoute = r.route;
    }
  }

  await prisma.networkSummaryDaily.upsert({
    where: { date: yesterday },
    create: {
      date: yesterday,
      activeVehicles: uniqueVehicles,
      totalTrips: allTrips.length,
      avgCommercialSpeed: networkAvgSpeed ? Math.round(networkAvgSpeed * 10) / 10 : null,
      avgExcessWaitTime: networkAvgEwt ? Math.round(networkAvgEwt) : null,
      worstRoute,
      worstRouteEwt: worstEwt,
      positionsCollected: BigInt(totalPositions),
    },
    update: {
      activeVehicles: uniqueVehicles,
      totalTrips: allTrips.length,
      avgCommercialSpeed: networkAvgSpeed ? Math.round(networkAvgSpeed * 10) / 10 : null,
      avgExcessWaitTime: networkAvgEwt ? Math.round(networkAvgEwt) : null,
      worstRoute,
      worstRouteEwt: worstEwt,
      positionsCollected: BigInt(totalPositions),
    },
  });

  const elapsed = Date.now() - startTime;
  console.log(
    `[aggregate] Complete for ${dateStr}: ${totalPositions} positions, ${allTrips.length} trips in ${elapsed}ms`
  );
}
