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

// Route info from OTP (source of truth for all transit lines)
export interface RouteInfo {
  shortName: string;
  longName: string;
  mode: "BUS" | "SUBWAY" | "TRAM" | "RAIL" | "FERRY";
  gtfsId: string;
}

export interface RoutesResponse {
  routes: RouteInfo[];
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

// Feedback types

export type FeedbackType = "LINE" | "STOP" | "VEHICLE";

export interface FeedbackMetadata {
  lineContext?: string; // routeShortName the vehicle was on when rated
}

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  targetId: string;
  rating: number;
  comment: string | null;
  metadata: FeedbackMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackSummaryData {
  avg: number;
  count: number;
}

export interface FeedbackSummaryResponse {
  [key: string]: FeedbackSummaryData;
}

export interface FeedbackListResponse {
  feedbacks: FeedbackItem[];
  total: number;
  userFeedback: FeedbackItem | null; // current user's feedback for this target
}

export interface FeedbackCreateRequest {
  type: FeedbackType;
  targetId: string;
  rating: number;
  comment?: string;
  metadata?: FeedbackMetadata;
}
