import { NextRequest, NextResponse } from "next/server";
// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";
import { OTPLineResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry, KeyedStaleCache } from "@/lib/api-fetch";

const OTP_URL = "https://otp.portodigital.pt/otp/routers/default/index/graphql";

// Per-line stale cache (1 hour — route info is stable)
const staleCache = new KeyedStaleCache<unknown>(60 * 60 * 1000, 200);

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
    const response = await fetchWithRetry(OTP_URL, {
      maxRetries: 3,
      timeoutMs: 10000,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: QUERY,
          variables: { name: lineId },
        }),
      },
    });

    const raw = await response.json();
    const parsed = OTPLineResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("OTP line response validation failed:", parsed.error.message);
    }

    const routes = parsed.success ? parsed.data.data.routes : raw?.data?.routes;

    if (!routes || routes.length === 0) {
      return NextResponse.json(
        { error: "Line not found" },
        { status: 404 }
      );
    }

    const route = routes.find(
      (r: { shortName: string }) => r.shortName === lineId
    ) || routes[0];

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

    const data = {
      gtfsId: route.gtfsId,
      shortName: route.shortName,
      longName: route.longName,
      patterns,
      stops: allStops,
    };

    staleCache.set(lineId, data);

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error fetching line info:", error);

    const cached = staleCache.get(lineId);
    if (cached) {
      return NextResponse.json({ ...cached.data as object, stale: true });
    }

    return NextResponse.json(
      { error: "Failed to fetch line info" },
      { status: 500 }
    );
  }
}
