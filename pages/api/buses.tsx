import type { NextApiRequest, NextApiResponse } from "next";

interface Bus {
  id: string;
  lat: number;
  lon: number;
  routeShortName: string;
  routeLongName: string;
  heading: number;
  speed: number;
  lastUpdated: string;
  vehicleNumber: string;
}

interface FiwareResponse {
  id: string;
  type: string;
  location?: {
    type: string;
    value: {
      type: string;
      coordinates: [number, number];
    };
  };
  [key: string]: any;
}

interface OTPRoute {
  gtfsId: string;
  shortName: string;
  longName: string;
  patterns: Array<{ headsign: string }>;
}

interface OTPResponse {
  data: {
    routes: OTPRoute[];
  };
}

// Cache for route destinations (in-memory cache)
let routeDestinationsCache: Map<string, string[]> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function fetchRouteDestinations(): Promise<Map<string, string[]>> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (routeDestinationsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return routeDestinationsCache;
  }

  try {
    const response = await fetch(
      "https://otp.services.porto.digital/otp/routers/default/index/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: `query { routes { gtfsId shortName longName patterns { headsign } } }`,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`OTP API returned ${response.status}`);
    }

    const data: OTPResponse = await response.json();
    const routeMap = new Map<string, string[]>();

    // Build a map of route shortName -> possible destinations
    data.data.routes.forEach((route) => {
      const destinations = new Set<string>();
      
      // Add longName as primary destination
      if (route.longName) {
        destinations.add(route.longName);
      }
      
      // Add all unique headsigns
      route.patterns.forEach((pattern) => {
        if (pattern.headsign) {
          destinations.add(pattern.headsign);
        }
      });

      if (destinations.size > 0) {
        routeMap.set(route.shortName, Array.from(destinations));
      }
    });

    routeDestinationsCache = routeMap;
    cacheTimestamp = now;
    
    console.log(`Cached destinations for ${routeMap.size} routes`);
    return routeMap;
  } catch (error) {
    console.error("Error fetching route destinations:", error);
    // Return existing cache or empty map
    return routeDestinationsCache || new Map();
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ buses: Bus[] } | { error: string }>
) {
  try {
    // Fetch route destinations (will use cache if available)
    const routeDestinations = await fetchRouteDestinations();

    const response = await fetch(
      "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000",
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`FIWARE API returned ${response.status}`);
    }

    const data: FiwareResponse[] = await response.json();

    // Log first few entities to see available fields (for debugging)
    if (data.length > 0) {
      console.log("=== FIWARE Entity Sample ===");
      console.log("First entity ID:", data[0].id);
      console.log("First entity keys:", Object.keys(data[0]));
      console.log("Full first entity:", JSON.stringify(data[0], null, 2));
      if (data.length > 1) {
        console.log("Second entity ID:", data[1].id);
      }
      console.log("===========================");
    }

    // Parse and normalize the FIWARE entities
    const buses: Bus[] = data
      .filter((entity) => entity.location?.value?.coordinates)
      .map((entity) => {
        const coords = entity.location!.value.coordinates;
        
        // Extract route number from entity ID (format: urn:ngsi-ld:Vehicle:ROUTE:ID)
        // Example: urn:ngsi-ld:Vehicle:stcp:205:123456 -> route is "205"
        // Or: Vehicle number "STCP 805 3264" -> route is "805"
        let routeShortName = "Unknown";
        
        // Try to extract from various fields
        if (entity.routeShortName?.value) {
          routeShortName = entity.routeShortName.value;
        } else if (entity.route?.value) {
          routeShortName = entity.route.value;
        } else if (entity.lineId?.value) {
          routeShortName = entity.lineId.value;
        } else if (entity.line?.value) {
          routeShortName = entity.line.value;
        } else {
          // Try parsing from vehicle identifier first (e.g., "STCP 805 3264" -> "805")
          const vehicleId = entity.vehiclePlateIdentifier?.value || 
                           entity.vehicleNumber?.value || 
                           entity.license_plate?.value ||
                           entity.name?.value || "";
          
          if (vehicleId) {
            // Extract route number from vehicle ID like "STCP 805 3264"
            const match = vehicleId.match(/STCP\s+(\d+)/i);
            if (match && match[1]) {
              routeShortName = match[1];
            }
          }
          
          // If still not found, parse URN
          if (routeShortName === "Unknown" && entity.id) {
            // Parse URN format: urn:ngsi-ld:Vehicle:stcp:ROUTE:ID
            const parts = entity.id.split(":");
            
            // Try to find a numeric part (likely the route number)
            for (let i = 2; i < parts.length - 1; i++) {
              const part = parts[i];
              // Check if it's a number or alphanumeric route (like "205", "502", "ZM")
              // Skip known prefixes: Vehicle, porto, stcp
              if (part && 
                  part !== "Vehicle" && 
                  part !== "porto" && 
                  part !== "stcp" &&
                  /^[A-Z0-9]{1,4}$/i.test(part)) {
                routeShortName = part;
                break;
              }
            }
            
            // Fallback: if still Unknown, try the part before the last one
            if (routeShortName === "Unknown" && parts.length >= 4) {
              const candidate = parts[parts.length - 2];
              if (candidate && candidate !== "Vehicle" && candidate !== "stcp") {
                routeShortName = candidate;
              }
            }
          }
        }
        
        // Get destination from cache based on route number
        let routeLongName = 
          entity.routeLongName?.value ||
          entity.destination?.value ||
          entity.tripHeadsign?.value ||
          entity.headsign?.value ||
          entity.direction?.value ||
          entity.directionId?.value ||
          "";
        
        // If no destination from FIWARE, try to get from OTP route data
        if (!routeLongName && routeDestinations.has(routeShortName)) {
          const destinations = routeDestinations.get(routeShortName)!;
          // Use the first destination (usually the main one from longName)
          // or join multiple destinations
          if (destinations.length === 1) {
            routeLongName = destinations[0];
          } else if (destinations.length > 1) {
            // Show primary destination (first one, which is usually from longName)
            routeLongName = destinations[0];
          }
        }
        
        const vehicleNumber = 
          entity.vehiclePlateIdentifier?.value ||
          entity.vehicleNumber?.value ||
          entity.license_plate?.value ||
          entity.name?.value ||
          entity.id.split(":").pop() || // Last part of ID
          "";
        
        // Clean up vehicle number - extract just the number part
        // E.g., "STCP 805 3264" -> "3264" or keep as is
        let cleanVehicleNumber = vehicleNumber;
        if (typeof vehicleNumber === 'string') {
          // Try to extract the last numeric part (the actual vehicle number)
          const parts = vehicleNumber.trim().split(/\s+/);
          if (parts.length > 0) {
            // Take the last part which is usually the vehicle number
            const lastPart = parts[parts.length - 1];
            if (/^\d+$/.test(lastPart)) {
              cleanVehicleNumber = lastPart;
            }
          }
        }
        
        const heading = 
          entity.heading?.value ||
          entity.bearing?.value ||
          0;
        
        const speed = 
          entity.speed?.value ||
          0;
        
        const lastUpdated = 
          entity.dateModified?.value ||
          entity.timestamp?.value ||
          new Date().toISOString();

        return {
          id: entity.id,
          lat: coords[1], // GeoJSON uses [lon, lat]
          lon: coords[0],
          routeShortName: String(routeShortName),
          routeLongName: String(routeLongName),
          heading: Number(heading),
          speed: Number(speed),
          lastUpdated: String(lastUpdated),
          vehicleNumber: String(cleanVehicleNumber),
        };
      });

    res.status(200).json({ buses });
  } catch (error) {
    console.error("Error fetching buses:", error);
    res.status(500).json({ error: "Failed to fetch bus data" });
  }
}
