/**
 * Cron: Refresh route segment definitions from OTP pattern geometries
 */

import { prisma } from "./prisma.js";
import { splitIntoSegments } from "./segments.js";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";

const OTP_URL =
  "https://otp.portodigital.pt/otp/routers/default/index/graphql";

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
  timeoutMs = 30000
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`API returned ${response.status}`);
      }
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw new Error(
        `API returned ${response.status} after ${maxRetries} attempts`
      );
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw new Error("Max retries exceeded");
}

export async function runRefreshSegments(): Promise<void> {
  const startTime = Date.now();
  console.log("[segments] Refreshing route segments from OTP...");

  const response = await fetchWithRetry(OTP_URL, {
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
            stops { gtfsId name lat lon }
          }
        }
      }`,
    }),
  });

  const raw = await response.json();
  const routes = raw?.data?.routes;
  if (!Array.isArray(routes)) {
    console.error("[segments] Invalid OTP response");
    return;
  }

  let totalSegments = 0;

  for (const route of routes) {
    if (!route.shortName || !route.patterns) continue;

    for (const pattern of route.patterns) {
      if (!pattern.patternGeometry?.points) continue;

      try {
        const decoded: [number, number][] = polyline.decode(
          pattern.patternGeometry.points
        );
        const coordinates: [number, number][] = decoded.map(
          (c: [number, number]) => [c[1], c[0]]
        );

        const segments = splitIntoSegments(
          route.shortName,
          pattern.directionId,
          coordinates,
          200
        );

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

        // Upsert RouteStop records from pattern stops
        if (Array.isArray(pattern.stops)) {
          for (let seq = 0; seq < pattern.stops.length; seq++) {
            const stop = pattern.stops[seq];
            if (!stop?.gtfsId) continue;
            const stopId = `${route.shortName}:${pattern.directionId}:${seq}`;
            await prisma.routeStop.upsert({
              where: { id: stopId },
              create: {
                id: stopId,
                route: route.shortName,
                directionId: pattern.directionId,
                stopSequence: seq,
                stopId: stop.gtfsId,
                stopName: stop.name ?? null,
                lat: stop.lat,
                lon: stop.lon,
              },
              update: {
                stopId: stop.gtfsId,
                stopName: stop.name ?? null,
                lat: stop.lat,
                lon: stop.lon,
              },
            });
          }
        }
      } catch (err) {
        console.error(
          `[segments] Failed to process pattern for ${route.shortName}:${pattern.directionId}`,
          err
        );
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[segments] Refreshed ${totalSegments} segments from ${routes.length} routes in ${elapsed}ms`
  );
}
