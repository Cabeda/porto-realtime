/**
 * API: Data export endpoints (#72)
 *
 * - positions: today from Neon, historical from R2 Parquet (presigned URL redirect)
 * - route-performance: from Neon (aggregated, small)
 * - segments: from Neon (reference data)
 * - archives: list available R2 archive dates
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { listArchiveDates, getArchiveUrl, isR2Configured } from "@/lib/r2";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "string" && val.includes(","))
            return `"${val}"`;
          return String(val);
        })
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "positions";
  const date = request.nextUrl.searchParams.get("date");
  const route = request.nextUrl.searchParams.get("route");
  const format = request.nextUrl.searchParams.get("format") || "json";
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  try {
    // List available R2 archive dates
    if (type === "archives") {
      const dates = await listArchiveDates();
      return NextResponse.json({
        dates,
        r2Configured: isR2Configured(),
        format: "parquet",
        note: "Use type=positions&date=YYYY-MM-DD&format=parquet to download",
      });
    }

    if (type === "positions") {
      if (!date) {
        return NextResponse.json(
          { error: "date parameter required for positions export" },
          { status: 400 }
        );
      }

      // Check if requesting Parquet format — redirect to R2
      if (format === "parquet") {
        const url = await getArchiveUrl(date);
        if (url) {
          return NextResponse.redirect(url);
        }
        return NextResponse.json(
          { error: `No Parquet archive found for ${date}. Archives are created daily for previous days.` },
          { status: 404 }
        );
      }

      // Check if date is today — serve from Neon
      const today = new Date().toISOString().slice(0, 10);
      if (date === today) {
        const dayStart = new Date(date + "T00:00:00Z");
        const dayEnd = new Date(date + "T23:59:59Z");

        const positions = await prisma.busPositionLog.findMany({
          where: {
            recordedAt: { gte: dayStart, lte: dayEnd },
            ...(route ? { route } : {}),
          },
          orderBy: { recordedAt: "asc" },
          take: 500000,
        });

        const data = positions.map((p) => ({
          recorded_at: p.recordedAt.toISOString(),
          vehicle_id: p.vehicleId,
          vehicle_num: p.vehicleNum,
          route: p.route,
          trip_id: p.tripId,
          direction_id: p.directionId,
          lat: p.lat,
          lon: p.lon,
          speed: p.speed,
          heading: p.heading,
        }));

        if (format === "csv") {
          return new NextResponse(toCsv(data), {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="positions-${date}.csv"`,
            },
          });
        }

        return NextResponse.json({
          data,
          meta: {
            type: "positions",
            date,
            source: "live",
            route: route || "all",
            count: data.length,
            methodology: "/analytics/about",
          },
        });
      }

      // Historical date — try R2 first, then fall back to Neon (if data still exists)
      const archiveUrl = await getArchiveUrl(date);
      if (archiveUrl) {
        return NextResponse.json({
          data: [],
          meta: {
            type: "positions",
            date,
            source: "r2",
            archiveUrl,
            format: "parquet",
            note: "Historical data is archived as Parquet. Use the archiveUrl to download, or add format=parquet to redirect directly.",
            methodology: "/analytics/about",
          },
        });
      }

      // Fall back to Neon (data might still be within retention window)
      const dayStart = new Date(date + "T00:00:00Z");
      const dayEnd = new Date(date + "T23:59:59Z");

      const positions = await prisma.busPositionLog.findMany({
        where: {
          recordedAt: { gte: dayStart, lte: dayEnd },
          ...(route ? { route } : {}),
        },
        orderBy: { recordedAt: "asc" },
        take: 500000,
      });

      if (positions.length === 0) {
        return NextResponse.json(
          { error: `No position data available for ${date}. Data older than 1 day is archived to R2 as Parquet.` },
          { status: 404 }
        );
      }

      const data = positions.map((p) => ({
        recorded_at: p.recordedAt.toISOString(),
        vehicle_id: p.vehicleId,
        vehicle_num: p.vehicleNum,
        route: p.route,
        trip_id: p.tripId,
        direction_id: p.directionId,
        lat: p.lat,
        lon: p.lon,
        speed: p.speed,
        heading: p.heading,
      }));

      if (format === "csv") {
        return new NextResponse(toCsv(data), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="positions-${date}.csv"`,
          },
        });
      }

      return NextResponse.json({
        data,
        meta: {
          type: "positions",
          date,
          source: "neon",
          route: route || "all",
          count: data.length,
          methodology: "/analytics/about",
        },
      });
    }

    if (type === "route-performance") {
      const fromDate = from ? new Date(from + "T00:00:00Z") : new Date(Date.now() - 30 * 86400000);
      const toDate = to ? new Date(to + "T23:59:59Z") : new Date();

      const perf = await prisma.routePerformanceDaily.findMany({
        where: {
          date: { gte: fromDate, lte: toDate },
          ...(route ? { route } : {}),
        },
        orderBy: { date: "asc" },
      });

      const data = perf.map((p) => ({
        date: p.date.toISOString().slice(0, 10),
        route: p.route,
        direction_id: p.directionId,
        trips_observed: p.tripsObserved,
        avg_headway_secs: p.avgHeadwaySecs,
        headway_adherence_pct: p.headwayAdherencePct,
        excess_wait_time_secs: p.excessWaitTimeSecs,
        avg_runtime_secs: p.avgRuntimeSecs,
        avg_commercial_speed: p.avgCommercialSpeed,
        bunching_pct: p.bunchingPct,
        gapping_pct: p.gappingPct,
      }));

      if (format === "csv") {
        return new NextResponse(toCsv(data), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="route-performance.csv"`,
          },
        });
      }

      return NextResponse.json({
        data,
        meta: { type: "route-performance", from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10), count: data.length, methodology: "/analytics/about" },
      });
    }

    if (type === "segments") {
      const segments = await prisma.routeSegment.findMany({
        where: route ? { route } : undefined,
      });

      if (format === "geojson") {
        const geojson = {
          type: "FeatureCollection",
          features: segments.map((s) => ({
            type: "Feature",
            geometry: s.geometry,
            properties: {
              id: s.id,
              route: s.route,
              directionId: s.directionId,
              segmentIndex: s.segmentIndex,
              lengthM: s.lengthM,
            },
          })),
        };
        return new NextResponse(JSON.stringify(geojson), {
          headers: {
            "Content-Type": "application/geo+json",
            "Content-Disposition": `attachment; filename="segments.geojson"`,
          },
        });
      }

      return NextResponse.json({
        data: segments.map((s) => ({
          id: s.id,
          route: s.route,
          direction_id: s.directionId,
          segment_index: s.segmentIndex,
          length_m: s.lengthM,
          geometry: s.geometry,
        })),
        meta: { type: "segments", count: segments.length },
      });
    }

    return NextResponse.json({ error: "Invalid type. Use: positions, route-performance, segments, archives" }, { status: 400 });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
