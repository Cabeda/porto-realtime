import { type NextRequest, NextResponse } from "next/server";
import { getSimulatedBuses } from "@/lib/simulate";
import { toTitleCase } from "@/lib/strings";
import {
  FiwareVehiclesResponseSchema,
  type FiwareVehicleEntity,
  unwrap,
  unwrapAnnotations,
  unwrapLocation,
} from "@/lib/schemas/fiware";
import { OTPRoutesResponseSchema } from "@/lib/schemas/otp";
import { fetchWithRetry } from "@/lib/api-fetch";
import { logger } from "@/lib/logger";

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
  tripId: string;
}

interface RouteDirectionMap {
  destinations: string[];
  directionHeadsigns: Map<number, string[]>;
}

// Cache for route destinations (in-memory cache)
let routeDestinationsCache: Map<string, RouteDirectionMap> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Last successful bus data for fallback
let lastSuccessfulBusData: Bus[] | null = null;
let lastSuccessfulTimestamp = 0;
const STALE_DATA_THRESHOLD = 5 * 60 * 1000; // 5 minutes

// fetchWithRetry is now imported from @/lib/api-fetch

export function buildRouteDestinationMap(
  routes: Array<{
    shortName: string;
    patterns: Array<{ headsign?: string | null; directionId: number }>;
  }>
): Map<string, RouteDirectionMap> {
  const routeMap = new Map<string, RouteDirectionMap>();

  routes.forEach((route) => {
    const directionMap = new Map<number, string[]>();

    route.patterns.forEach((pattern) => {
      if (pattern.headsign) {
        if (!directionMap.has(pattern.directionId)) {
          directionMap.set(pattern.directionId, []);
        }
        const headsigns = directionMap.get(pattern.directionId)!;
        if (!headsigns.includes(pattern.headsign)) {
          headsigns.push(pattern.headsign);
        }
      }
    });

    if (directionMap.size > 0) {
      routeMap.set(route.shortName, {
        destinations: Array.from(directionMap.values()).flat(),
        directionHeadsigns: directionMap,
      });
    }
  });

  return routeMap;
}

async function fetchRouteDestinations(): Promise<Map<string, RouteDirectionMap>> {
  const now = Date.now();

  // Return cached data if still valid
  if (routeDestinationsCache && now - cacheTimestamp < CACHE_DURATION) {
    return routeDestinationsCache;
  }

  try {
    const response = await fetchWithRetry(
      "https://otp.portodigital.pt/otp/routers/default/index/graphql",
      {
        maxRetries: 3,
        timeoutMs: 15000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://explore.porto.pt",
          },
          body: JSON.stringify({
            query: `query { routes { gtfsId shortName longName patterns { headsign directionId } } }`,
          }),
        },
      }
    );

    const raw = await response.json();
    const parsed = OTPRoutesResponseSchema.safeParse(raw);

    if (!parsed.success) {
      console.warn("OTP routes response validation failed:", parsed.error.message);
      return routeDestinationsCache || new Map();
    }

    const data = parsed.data;
    const routeMap = buildRouteDestinationMap(data.data.routes);

    routeDestinationsCache = routeMap;
    cacheTimestamp = now;

    logger.log(`Cached destinations for ${routeMap.size} routes`);
    return routeMap;
  } catch (error) {
    console.error("Error fetching route destinations:", error);
    return routeDestinationsCache || new Map();
  }
}

/**
 * Parse STCP annotations from FIWARE entity.
 * stcp:sentido values are 0-indexed and map directly to OTP directionId.
 */
export function parseAnnotations(annotations: string[] | undefined): {
  directionId: number | null;
  tripId: string;
} {
  let directionId: number | null = null;
  let tripId = "";

  if (!annotations || !Array.isArray(annotations)) {
    return { directionId, tripId };
  }

  const sentidoAnnotation = annotations.find(
    (ann) => typeof ann === "string" && ann.startsWith("stcp:sentido:")
  );
  if (sentidoAnnotation) {
    const match = sentidoAnnotation.match(/stcp:sentido:(\d+)/);
    if (match && match[1]) {
      directionId = parseInt(match[1], 10);
    }
  }

  const viagemAnnotation = annotations.find(
    (ann) => typeof ann === "string" && ann.startsWith("stcp:nr_viagem:")
  );
  if (viagemAnnotation) {
    tripId = viagemAnnotation.replace("stcp:nr_viagem:", "");
  }

  return { directionId, tripId };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Fetch route destinations (will use cache if available)
    const routeDestinations = await fetchRouteDestinations();

    const response = await fetchWithRetry(
      "https://broker.fiware.urbanplatform.portodigital.pt/v2/entities?q=vehicleType==bus&limit=1000",
      {
        maxRetries: 3,
        timeoutMs: 10000,
        init: {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
          },
        },
      }
    );

    const rawData = await response.json();
    const fiwareParsed = FiwareVehiclesResponseSchema.safeParse(rawData);

    let validEntities: FiwareVehicleEntity[];
    if (fiwareParsed.success) {
      validEntities = fiwareParsed.data;
    } else {
      // Graceful degradation: log warning, try to use raw data filtering invalid entities
      console.warn(
        `FIWARE response validation failed (${fiwareParsed.error.issues.length} issues), falling back to raw data`
      );
      // Filter to only entities that at least have id and location with coordinates
      validEntities = (Array.isArray(rawData) ? rawData : []).filter(
        (e: Record<string, unknown>) => e?.id && (e?.location as Record<string, unknown>)?.value
      );
    }

    // Parse and normalize the FIWARE entities
    const buses: Bus[] = validEntities
      .filter((entity) => {
        try {
          unwrapLocation(entity.location);
          return true;
        } catch {
          return false;
        }
      })
      .map((entity) => {
        const coords = unwrapLocation(entity.location);

        let routeShortName = "Unknown";

        const rsn = unwrap(entity.routeShortName);
        const rte = unwrap(entity.route);
        const lid = unwrap(entity.lineId);
        const lin = unwrap(entity.line);

        if (rsn) {
          routeShortName = rsn;
        } else if (rte) {
          routeShortName = rte;
        } else if (lid) {
          routeShortName = lid;
        } else if (lin) {
          routeShortName = lin;
        } else {
          const vehicleId =
            unwrap(entity.vehiclePlateIdentifier) ||
            unwrap(entity.vehicleNumber) ||
            unwrap(entity.license_plate) ||
            unwrap(entity.name) ||
            "";

          if (vehicleId) {
            const match = vehicleId.match(/STCP\s+(\d+)/i);
            if (match && match[1]) {
              routeShortName = match[1];
            }
          }

          if (routeShortName === "Unknown" && entity.id) {
            const parts = entity.id.split(":");

            for (let i = 2; i < parts.length - 1; i++) {
              const part = parts[i];
              if (
                part &&
                part !== "Vehicle" &&
                part !== "porto" &&
                part !== "stcp" &&
                /^[A-Z0-9]{1,4}$/i.test(part)
              ) {
                routeShortName = part;
                break;
              }
            }

            if (routeShortName === "Unknown" && parts.length >= 4) {
              const candidate = parts[parts.length - 2];
              if (candidate && candidate !== "Vehicle" && candidate !== "stcp") {
                routeShortName = candidate;
              }
            }
          }
        }

        // Extract direction from FIWARE annotations
        // STCP uses 1-indexed sentido (1, 2), OTP uses 0-indexed directionId (0, 1)
        const { directionId, tripId } = parseAnnotations(unwrapAnnotations(entity.annotations));

        // Get destination from cache based on route number and direction
        let routeLongName =
          unwrap(entity.routeLongName) ||
          unwrap(entity.destination) ||
          unwrap(entity.tripHeadsign) ||
          unwrap(entity.headsign) ||
          unwrap(entity.direction) ||
          unwrap(entity.directionId) ||
          "";

        if (!routeLongName && routeDestinations.has(routeShortName)) {
          const routeData = routeDestinations.get(routeShortName)!;

          // Prefer the headsign for the known direction; fall back to direction 0
          const resolvedDirection =
            directionId !== null && routeData.directionHeadsigns.has(directionId) ? directionId : 0;
          const directionHeadsigns = routeData.directionHeadsigns.get(resolvedDirection);
          routeLongName = directionHeadsigns?.[0] || "";
        }

        const vehicleNumber =
          unwrap(entity.vehiclePlateIdentifier) ||
          unwrap(entity.vehicleNumber) ||
          unwrap(entity.license_plate) ||
          unwrap(entity.name) ||
          entity.id.split(":").pop() ||
          "";

        let cleanVehicleNumber = vehicleNumber;
        if (typeof vehicleNumber === "string") {
          const parts = vehicleNumber.trim().split(/\s+/);
          if (parts.length > 0) {
            const lastPart = parts[parts.length - 1]!;
            if (/^\d+$/.test(lastPart)) {
              cleanVehicleNumber = lastPart as string;
            }
          }
        }

        const heading = unwrap(entity.heading) || unwrap(entity.bearing) || 0;
        const speed = unwrap(entity.speed) || 0;
        const lastUpdated =
          unwrap(entity.dateModified) || unwrap(entity.timestamp) || new Date().toISOString();

        return {
          id: entity.id,
          lat: coords[1],
          lon: coords[0],
          routeShortName: String(routeShortName),
          routeLongName: toTitleCase(String(routeLongName)),
          heading: Number(heading),
          speed: Number(speed),
          lastUpdated: String(lastUpdated),
          vehicleNumber: String(cleanVehicleNumber),
          tripId,
        };
      });

    // Inject simulated buses if requested (dev mode)
    const simulate = request.nextUrl.searchParams.get("simulate");
    if (simulate) {
      const routes = simulate.split(",");
      const simBuses = await getSimulatedBuses(routes);
      buses.push(...simBuses);
    }

    // Update last successful data
    lastSuccessfulBusData = buses;
    lastSuccessfulTimestamp = Date.now();

    const responseTime = Date.now() - startTime;
    return NextResponse.json(
      { buses },
      {
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60",
          "X-Response-Time": `${responseTime}ms`,
        },
      }
    );
  } catch (error) {
    console.error("Error fetching buses:", error);

    const now = Date.now();
    if (lastSuccessfulBusData && now - lastSuccessfulTimestamp < STALE_DATA_THRESHOLD) {
      logger.log("Returning stale bus data from cache");
      return NextResponse.json(
        { buses: lastSuccessfulBusData, stale: true },
        {
          headers: {
            "Cache-Control": "public, max-age=0, must-revalidate",
          },
        }
      );
    } else {
      return NextResponse.json(
        {
          error: "Failed to fetch bus data",
          buses: lastSuccessfulBusData || [],
        },
        { status: 500 }
      );
    }
  }
}
