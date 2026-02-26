// Simulation engine: generates virtual buses walking along real route polylines.
// Designed for dev testing and future timeline/replay features.

// @ts-ignore - No types available for @mapbox/polyline
import polyline from "@mapbox/polyline";

interface SimBus {
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

interface CachedRoute {
  coords: [number, number][]; // [lat, lon][]
  cumDist: number[]; // cumulative distance in meters
  totalDist: number;
  longName: string;
  headsign: string;
}

const routeCache = new Map<string, CachedRoute[]>();

const SPEED_MS = 20_000 / 3600; // 20 km/h in m/s

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

async function fetchRoutePolylines(routeShortName: string): Promise<CachedRoute[]> {
  if (routeCache.has(routeShortName)) return routeCache.get(routeShortName)!;

  const res = await fetch("https://otp.portodigital.pt/otp/routers/default/index/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://explore.porto.pt" },
    body: JSON.stringify({
      query: `query { routes(name: "${routeShortName}") { shortName longName patterns { headsign directionId patternGeometry { points } } } }`,
    }),
  });
  const data = await res.json();
  const routes: CachedRoute[] = [];

  for (const route of data.data?.routes || []) {
    if (route.shortName !== routeShortName) continue;
    for (const pattern of route.patterns || []) {
      if (!pattern.patternGeometry?.points) continue;
      const coords: [number, number][] = polyline.decode(pattern.patternGeometry.points);
      if (coords.length < 2) continue;

      const cumDist = [0];
      for (let i = 1; i < coords.length; i++) {
        cumDist.push(
          cumDist[i - 1]! +
            haversineM(coords[i - 1]![0], coords[i - 1]![1], coords[i]![0], coords[i]![1])
        );
      }

      routes.push({
        coords,
        cumDist,
        totalDist: cumDist[cumDist.length - 1]!,
        longName: route.longName || "",
        headsign: pattern.headsign || route.longName || "",
      });
    }
  }

  routeCache.set(routeShortName, routes);
  return routes;
}

function positionAtDistance(
  route: CachedRoute,
  dist: number
): { lat: number; lon: number; heading: number } {
  const { coords, cumDist } = route;
  // Binary search for segment
  let lo = 0,
    hi = cumDist.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumDist[mid]! <= dist) lo = mid;
    else hi = mid;
  }
  const segLen = cumDist[hi]! - cumDist[lo]!;
  const t = segLen > 0 ? (dist - cumDist[lo]!) / segLen : 0;
  const loCoord = coords[lo]!;
  const hiCoord = coords[hi]!;
  return {
    lat: loCoord[0] + (hiCoord[0] - loCoord[0]) * t,
    lon: loCoord[1] + (hiCoord[1] - loCoord[1]) * t,
    heading: bearing(loCoord[0], loCoord[1], hiCoord[0], hiCoord[1]),
  };
}

/** Generate simulated buses for the given route short names. Each route gets one bus per direction. */
export async function getSimulatedBuses(routeNames: string[]): Promise<SimBus[]> {
  const buses: SimBus[] = [];
  const now = Date.now() / 1000; // seconds

  for (const name of routeNames) {
    const routes = await fetchRoutePolylines(name);
    routes.forEach((route, i) => {
      const totalTime = route.totalDist / SPEED_MS;
      // Offset each direction so they don't overlap
      const elapsed = (now + i * totalTime * 0.4) % totalTime;
      const dist = elapsed * SPEED_MS;
      const pos = positionAtDistance(route, dist);

      buses.push({
        id: `sim-${name}-${i}`,
        lat: pos.lat,
        lon: pos.lon,
        routeShortName: name,
        routeLongName: route.headsign,
        heading: pos.heading,
        speed: 20,
        lastUpdated: new Date().toISOString(),
        vehicleNumber: `SIM${i}`,
        tripId: `sim-${name}-${i}`,
      });
    });
  }

  return buses;
}
