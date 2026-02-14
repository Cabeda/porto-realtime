import { NextRequest, NextResponse } from "next/server";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";

const QUERY = `
  query RouteInfo($name: String!) {
    routes(name: $name) {
      gtfsId
      shortName
      longName
      patterns {
        id
        headsign
        directionId
        stops {
          gtfsId
          name
          lat
          lon
          code
        }
        patternGeometry {
          length
          points
        }
      }
    }
  }
`;

// GET /api/line?id=205
// Returns route info with patterns, stops, and decoded polylines
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const lineId = searchParams.get("id");

  if (!lineId) {
    return NextResponse.json(
      { error: "Missing required parameter: id" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(OTP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://explore.porto.pt",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { name: lineId },
      }),
    });

    if (!response.ok) {
      throw new Error(`OTP API returned ${response.status}`);
    }

    const data = await response.json();
    const routes = data?.data?.routes;

    if (!routes || routes.length === 0) {
      return NextResponse.json(
        { error: "Line not found" },
        { status: 404 }
      );
    }

    // Find exact match by shortName (OTP name search is fuzzy)
    const route = routes.find(
      (r: { shortName: string }) => r.shortName === lineId
    ) || routes[0];

    // Transform patterns: decode polylines and deduplicate stops
    const patterns = (route.patterns || []).map(
      (p: {
        id: string;
        headsign: string;
        directionId: number;
        stops: { gtfsId: string; name: string; lat: number; lon: number; code: string }[];
        patternGeometry: { points: string } | null;
      }) => {
        let coordinates: [number, number][] = [];
        if (p.patternGeometry?.points) {
          try {
            const decoded: [number, number][] = polyline.decode(p.patternGeometry.points);
            coordinates = decoded.map(
              (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
            );
          } catch {
            // Skip invalid polylines
          }
        }

        return {
          id: p.id,
          headsign: p.headsign,
          directionId: p.directionId,
          stops: p.stops || [],
          coordinates,
        };
      }
    );

    // Collect unique stops across all patterns (preserving order from first pattern)
    const seenStops = new Set<string>();
    const allStops: { gtfsId: string; name: string; lat: number; lon: number; code: string }[] = [];
    for (const p of patterns) {
      for (const s of p.stops) {
        if (!seenStops.has(s.gtfsId)) {
          seenStops.add(s.gtfsId);
          allStops.push(s);
        }
      }
    }

    return NextResponse.json(
      {
        gtfsId: route.gtfsId,
        shortName: route.shortName,
        longName: route.longName,
        patterns,
        stops: allStops,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching line info:", error);
    return NextResponse.json(
      { error: "Failed to fetch line info" },
      { status: 500 }
    );
  }
}
