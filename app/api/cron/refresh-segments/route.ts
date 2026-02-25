/**
 * Cron job: Refresh route segment definitions from OTP pattern geometries.
 *
 * Fetches all route patterns from OTP, splits polylines into ~200m segments,
 * and upserts them into the RouteSegment table.
 *
 * Run weekly or on-demand. Authenticated via CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { splitIntoSegments } from "@/lib/analytics/segments";
import { fetchWithRetry } from "@/lib/api-fetch";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    // Fetch all route patterns with geometry from OTP
    const response = await fetchWithRetry(OTP_URL, {
      maxRetries: 3,
      timeoutMs: 30000,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: `query {
            routes {
              shortName
              patterns {
                directionId
                patternGeometry { points }
              }
            }
          }`,
        }),
      },
    });

    const raw = await response.json();
    const routes = raw?.data?.routes;
    if (!Array.isArray(routes)) {
      return NextResponse.json({ error: "Invalid OTP response" }, { status: 502 });
    }

    let totalSegments = 0;

    // Process each route pattern
    for (const route of routes) {
      if (!route.shortName || !route.patterns) continue;

      for (const pattern of route.patterns) {
        if (!pattern.patternGeometry?.points) continue;

        try {
          const decoded: [number, number][] = polyline.decode(pattern.patternGeometry.points);
          // polyline.decode returns [lat, lon], we need [lon, lat]
          const coordinates: [number, number][] = decoded.map((c: [number, number]) => [
            c[1],
            c[0],
          ]);

          const segments = splitIntoSegments(
            route.shortName,
            pattern.directionId,
            coordinates,
            200
          );

          // Upsert segments
          for (const seg of segments) {
            await prisma.routeSegment.upsert({
              where: { id: seg.id },
              create: {
                id: seg.id,
                route: seg.route,
                directionId: seg.directionId,
                segmentIndex: seg.segmentIndex,
                startLat: seg.startLat,
                startLon: seg.startLon,
                endLat: seg.endLat,
                endLon: seg.endLon,
                midLat: seg.midLat,
                midLon: seg.midLon,
                lengthM: seg.lengthM,
                geometry: seg.geometry as object,
              },
              update: {
                startLat: seg.startLat,
                startLon: seg.startLon,
                endLat: seg.endLat,
                endLon: seg.endLon,
                midLat: seg.midLat,
                midLon: seg.midLon,
                lengthM: seg.lengthM,
                geometry: seg.geometry as object,
              },
            });
          }

          totalSegments += segments.length;
        } catch (err) {
          console.error(
            `Failed to process pattern for ${route.shortName}:${pattern.directionId}`,
            err
          );
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `Segment refresh: ${totalSegments} segments from ${routes.length} routes in ${elapsed}ms`
    );

    return NextResponse.json({
      segments: totalSegments,
      routes: routes.length,
      elapsed: `${elapsed}ms`,
    });
  } catch (error) {
    console.error("Segment refresh failed:", error);
    return NextResponse.json({ error: "Segment refresh failed" }, { status: 500 });
  }
}
