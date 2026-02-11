import type { NextApiRequest, NextApiResponse } from "next";
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
  points: string; // Encoded polyline
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  
  try {
    const now = Date.now();
    
    // Return cached data if still valid
    if (routeShapesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      const responseTime = Date.now() - startTime;
      res.setHeader("Cache-Control", "public, s-maxage=86400"); // Cache for 24 hours
      res.setHeader("X-Response-Time", `${responseTime}ms`);
      res.setHeader("X-Cache-Status", "HIT");
      return res.status(200).json({ patterns: routeShapesCache });
    }

    // Fetch fresh data from OTP
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
    
    // Transform data into flat structure for easier frontend consumption
    const allPatterns: PatternGeometry[] = [];
    
    data.data.routes.forEach((route) => {
      route.patterns?.forEach((pattern) => {
        // Only include patterns that have valid geometry
        if (pattern.patternGeometry?.points) {
          try {
            // Decode the polyline to get coordinates
            const decodedCoords: [number, number][] = polyline.decode(pattern.patternGeometry.points);
            
            // Convert from [lat, lon] to [lon, lat] for GeoJSON standard
            const coordinates = decodedCoords.map(
              (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
            );

            allPatterns.push({
              patternId: pattern.id,
              routeShortName: route.shortName,
              routeLongName: route.longName,
              headsign: pattern.headsign,
              directionId: pattern.directionId,
              geometry: {
                type: "LineString",
                coordinates: coordinates,
              },
            });
          } catch (error) {
            console.error(`Failed to decode polyline for pattern ${pattern.id}:`, error);
          }
        }
      });
    });

    console.log(`Fetched ${allPatterns.length} route patterns with geometry`);

    // Update cache
    routeShapesCache = allPatterns;
    cacheTimestamp = now;

    const responseTime = Date.now() - startTime;
    res.setHeader("Cache-Control", "public, s-maxage=86400"); // Cache for 24 hours
    res.setHeader("X-Response-Time", `${responseTime}ms`);
    res.setHeader("X-Cache-Status", "MISS");
    res.status(200).json({ patterns: allPatterns });
  } catch (error) {
    console.error("Error fetching route shapes:", error);
    
    // Return cached data if available
    if (routeShapesCache) {
      console.log("Returning stale route shapes from cache");
      res.setHeader("X-Cache-Status", "STALE");
      return res.status(200).json({ patterns: routeShapesCache });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch route shapes",
      patterns: []
    });
  }
}
