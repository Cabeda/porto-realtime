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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface OTPRoute {
  gtfsId: string;
  shortName: string;
  longName: string;
  patterns: Array<{ 
    headsign: string;
    directionId: number;
  }>;
}

interface OTPResponse {
  data: {
    routes: OTPRoute[];
  };
}

interface RouteDirectionMap {
  destinations: string[];
  directionHeadsigns: Map<number, string[]>; // directionId -> headsigns
}

// Cache for route destinations (in-memory cache)
let routeDestinationsCache: Map<string, RouteDirectionMap> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Last successful bus data for fallback
let lastSuccessfulBusData: Bus[] | null = null;
let lastSuccessfulTimestamp = 0;
const STALE_DATA_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// Retry logic with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  timeoutMs = 10000
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`API returned ${response.status}`);
      }

      // Retry on 5xx (server errors)
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw new Error(`API returned ${response.status} after ${maxRetries} attempts`);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`Request timeout (${timeoutMs}ms) on attempt ${attempt + 1}`);
      }

      if (attempt === maxRetries - 1) {
        throw error;
      }

      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms due to: ${error instanceof Error ? error.message : error}`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error("Max retries exceeded");
}

async function fetchRouteDestinations(): Promise<Map<string, RouteDirectionMap>> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (routeDestinationsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return routeDestinationsCache;
  }

  try {
    const response = await fetchWithRetry(
      "https://otp.services.porto.digital/otp/routers/default/index/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://explore.porto.pt",
        },
        body: JSON.stringify({
          query: `query { routes { gtfsId shortName longName patterns { headsign directionId } } }`,
        }),
      },
      3,
      15000 // 15 second timeout for GraphQL
    );

    const data: OTPResponse = await response.json();
    const routeMap = new Map<string, RouteDirectionMap>();

    // Build a map of route shortName -> destinations and direction mappings
    data.data.routes.forEach((route) => {
      const allDestinations = new Set<string>();
      const directionMap = new Map<number, string[]>();
      
      // Add longName as primary destination
      if (route.longName) {
        allDestinations.add(route.longName);
      }
      
      // Group headsigns by directionId
      route.patterns.forEach((pattern) => {
        if (pattern.headsign) {
          allDestinations.add(pattern.headsign);
          
          if (!directionMap.has(pattern.directionId)) {
            directionMap.set(pattern.directionId, []);
          }
          
          const directionHeadsigns = directionMap.get(pattern.directionId)!;
          if (!directionHeadsigns.includes(pattern.headsign)) {
            directionHeadsigns.push(pattern.headsign);
          }
        }
      });

      if (allDestinations.size > 0) {
        routeMap.set(route.shortName, {
          destinations: Array.from(allDestinations),
          directionHeadsigns: directionMap,
        });
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
  res: NextApiResponse
) {
  const startTime = Date.now();
  
  try {
    // Fetch route destinations (will use cache if available)
    const routeDestinations = await fetchRouteDestinations();

    const response = await fetchWithRetry(
      "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000",
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      },
      3,
      10000 // 10 second timeout
    );

    const data: FiwareResponse[] = await response.json();

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
        
        // Extract direction from FIWARE annotations
        // Example: annotations.value = ["stcp:route:700", "stcp:sentido:1"]
        let directionId: number | null = null;
        if (entity.annotations?.value && Array.isArray(entity.annotations.value)) {
          const sentidoAnnotation = entity.annotations.value.find((ann: string) => 
            typeof ann === 'string' && ann.startsWith('stcp:sentido:')
          );
          if (sentidoAnnotation) {
            const match = sentidoAnnotation.match(/stcp:sentido:(\d+)/);
            if (match && match[1]) {
              directionId = parseInt(match[1], 10);
            }
          }
        }
        
        // Get destination from cache based on route number and direction
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
          const routeData = routeDestinations.get(routeShortName)!;
          
          // If we have a direction, use it to get the specific headsign
          if (directionId !== null && routeData.directionHeadsigns.has(directionId)) {
            const directionHeadsigns = routeData.directionHeadsigns.get(directionId)!;
            // Use the first headsign for this direction (most specific)
            routeLongName = directionHeadsigns[0] || "";
          } else {
            // Fallback: use the first destination from all destinations
            routeLongName = routeData.destinations[0] || "";
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

    // Update last successful data
    lastSuccessfulBusData = buses;
    lastSuccessfulTimestamp = Date.now();

    // Add cache headers and response time
    const responseTime = Date.now() - startTime;
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=60");
    res.setHeader("X-Response-Time", `${responseTime}ms`);
    res.status(200).json({ buses });
  } catch (error) {
    console.error("Error fetching buses:", error);
    
    // Return stale data if available and not too old
    const now = Date.now();
    if (lastSuccessfulBusData && (now - lastSuccessfulTimestamp) < STALE_DATA_THRESHOLD) {
      console.log("Returning stale bus data from cache");
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.status(200).json({ 
        buses: lastSuccessfulBusData,
        stale: true 
      });
    } else {
      res.status(500).json({ 
        error: "Failed to fetch bus data",
        buses: lastSuccessfulBusData || [] // Return empty or stale data
      });
    }
  }
}
