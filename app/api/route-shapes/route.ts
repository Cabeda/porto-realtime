import { NextResponse } from "next/server";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";
import { OTPRouteShapesResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry, StaleCache } from "@/lib/api-fetch";
import { toTitleCase } from "@/lib/strings";
import { readFallback } from "@/lib/fallback";

interface PatternGeometry {
  patternId: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  directionId: number;
  geometry: {
    type: string;
    coordinates: [number, number][];
  };
}

const staleCache = new StaleCache<PatternGeometry[]>(24 * 60 * 60 * 1000); // 24 hours

export async function GET() {
  const startTime = Date.now();

  // Return fresh cached data immediately
  const cached = staleCache.get();
  if (cached?.fresh) {
    const responseTime = Date.now() - startTime;
    return NextResponse.json(
      { patterns: cached.data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400",
          "X-Response-Time": `${responseTime}ms`,
          "X-Cache-Status": "HIT",
        },
      }
    );
  }

  try {
    console.log("Fetching route shapes from OTP...");

    const response = await fetchWithRetry(
      "https://otp.portodigital.pt/otp/routers/default/index/graphql",
      {
        maxRetries: 3,
        timeoutMs: 20000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://explore.porto.pt",
          },
          body: JSON.stringify({
            query: `query {
              routes {
                gtfsId
                shortName
                longName
                patterns {
                  id
                  headsign
                  directionId
                  patternGeometry {
                    length
                    points
                  }
                }
              }
            }`,
          }),
        },
      }
    );

    const raw = await response.json();
    const parsed = OTPRouteShapesResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("OTP route shapes validation failed:", parsed.error.message);
      if (!raw?.data?.routes) {
        throw new Error("Invalid response from OTP API");
      }
    }

    const routes = parsed.success ? parsed.data.data.routes : raw.data.routes;
    console.log(`Received ${routes.length} routes from OTP`);

    const allPatterns: PatternGeometry[] = [];

    routes.forEach(
      (route: {
        shortName: string;
        longName: string;
        patterns?: Array<{
          id: string;
          headsign?: string | null;
          directionId: number;
          patternGeometry?: { points: string } | null;
        }>;
      }) => {
        route.patterns?.forEach((pattern) => {
          if (pattern.patternGeometry?.points) {
            try {
              const decodedCoords: [number, number][] = polyline.decode(
                pattern.patternGeometry.points
              );
              const coordinates = decodedCoords.map(
                (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
              );

              allPatterns.push({
                patternId: pattern.id,
                routeShortName: route.shortName,
                routeLongName: toTitleCase(route.longName ?? ""),
                headsign: pattern.headsign || "",
                directionId: pattern.directionId,
                geometry: {
                  type: "LineString",
                  coordinates,
                },
              });
            } catch (error) {
              console.error(`Failed to decode polyline for pattern ${pattern.id}:`, error);
            }
          }
        });
      }
    );

    console.log(`Fetched ${allPatterns.length} route patterns with geometry`);

    staleCache.set(allPatterns);

    const responseTime = Date.now() - startTime;
    return NextResponse.json(
      { patterns: allPatterns },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400",
          "X-Response-Time": `${responseTime}ms`,
          "X-Cache-Status": "MISS",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching route shapes:", error);

    if (cached) {
      console.log("Returning stale route shapes from cache");
      return NextResponse.json(
        { patterns: cached.data },
        { headers: { "X-Cache-Status": "STALE" } }
      );
    }

    // Layer 4: static fallback from public/fallback/route-shapes.json
    const fallback = await readFallback<{ patterns: PatternGeometry[] }>("route-shapes.json");
    if (fallback?.patterns?.length) {
      console.log("Returning static fallback for route shapes");
      return NextResponse.json(fallback, {
        headers: { "X-Cache-Status": "FALLBACK" },
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch route shapes", patterns: [] },
      { status: 500 }
    );
  }
}
