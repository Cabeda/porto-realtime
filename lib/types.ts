// Shared types used across the application

export interface Bus {
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

export interface BusesResponse {
  buses: Bus[];
  stale?: boolean;
}

export interface Stop {
  id: string;
  code: string;
  desc: string;
  lat: number;
  lon: number;
  name: string;
  gtfsId: string;
}

export interface StopsResponse {
  data: {
    stops: Stop[];
  };
}

export interface PatternGeometry {
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

export interface RoutePatternsResponse {
  patterns: PatternGeometry[];
}

// Station departures types
export interface StoptimesWithoutPatterns {
  realtimeState: string;
  realtimeDeparture: number;
  scheduledDeparture: number;
  realtimeArrival: number;
  scheduledArrival: number;
  arrivalDelay: number;
  departureDelay: number;
  realtime: boolean;
  serviceDay: number;
  headsign: string;
  trip: {
    pattern: { code: string; id: string };
    route: {
      gtfsId: string;
      shortName: string;
      longName: string;
      mode: string;
      color: string;
      id: string;
    };
    id: string;
  };
}

export interface StationResponse {
  data: {
    stop: {
      id: string;
      name: string;
      stoptimesWithoutPatterns: StoptimesWithoutPatterns[];
    };
  };
  dataAvailable: boolean;
}
