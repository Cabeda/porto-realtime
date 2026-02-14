import { NextResponse } from "next/server";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";

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

interface OTPPatternGeometry {
  length: number;
  points: string;
}

interface OTPPattern {
  id: string;
  headsign: string;
  directionId: number;
  patternGeometry: OTPPatternGeometry;
}

interface OTPRoute {
  gtfsId: string;
  shortName: string;
  longName: string;
  patterns: OTPPattern[];
}

interface OTPResponse {
  data: {
    routes: OTPRoute[];
  };
}

// In-memory cache for route shapes
let routeShapesCache: PatternGeometry[] | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
  const startTime = Date.now();

  try {
    const now = Date.now();

    // Return cached data if still valid
    if (routeShapesCache && now - cacheTimestamp < CACHE_DURATION) {
      const responseTime = Date.now() - startTime;
      return NextResponse.json(
        { patterns: routeShapesCache },
        {
          headers: {
            "Cache-Control": "public, s-maxage=86400",
            "X-Response-Time": `${responseTime}ms`,
            "X-Cache-Status": "HIT",
          },
        }
      );
    }

    console.log("Fetching route shapes from OTP...");

    const response = await fetch(
      "https://otp.portodigital.pt/otp/routers/default/index/graphql",
      {
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OTP API error: ${response.status} - ${errorText}`);
      throw new Error(`OTP API returned ${response.status}`);
    }

    const data: OTPResponse = await response.json();

    if (!data.data || !data.data.routes) {
      console.error("Invalid response structure:", data);
      throw new Error("Invalid response from OTP API");
    }

    console.log(`Received ${data.data.routes.length} routes from OTP`);

    const allPatterns: PatternGeometry[] = [];

    data.data.routes.forEach((route) => {
      route.patterns?.forEach((pattern) => {
        if (pattern.patternGeometry?.points) {
          try {
            const decodedCoords: [number, number][] = polyline.decode(
              pattern.patternGeometry.points
            );
            const coordinates = decodedCoords.map(
              (coord: [number, number]) =>
                [coord[1], coord[0]] as [number, number]
            );

            allPatterns.push({
              patternId: pattern.id,
              routeShortName: route.shortName,
              routeLongName: route.longName,
              headsign: pattern.headsign,
              directionId: pattern.directionId,
              geometry: {
                type: "LineString",
                coordinates,
              },
            });
          } catch (error) {
            console.error(
              `Failed to decode polyline for pattern ${pattern.id}:`,
              error
            );
          }
        }
      });
    });

    console.log(`Fetched ${allPatterns.length} route patterns with geometry`);

    routeShapesCache = allPatterns;
    cacheTimestamp = now;

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

    if (routeShapesCache) {
      console.log("Returning stale route shapes from cache");
      return NextResponse.json(
        { patterns: routeShapesCache },
        { headers: { "X-Cache-Status": "STALE" } }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch route shapes", patterns: [] },
      { status: 500 }
    );
  }
}
