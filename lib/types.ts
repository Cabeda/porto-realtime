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
  vehicleMode?: string | null;
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
  color?: string | null; // hex color from GTFS/OTP (e.g. "009EE0"), no leading #
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

// Bike infrastructure types

export interface BikePark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  occupied: number;
  available: number;
  lastUpdated: string;
}

export interface BikeLane {
  id: string;
  name: string;
  type: string;
  status: "executed" | "planned";
  segments: [number, number][][]; // array of segments, each segment is an array of [lon, lat] coords
  length: number;
}

export interface BikeLanesResponse {
  lanes: BikeLane[];
}

export interface BikeParksResponse {
  parks: BikePark[];
}

// Feedback types

export type FeedbackType = "LINE" | "STOP" | "VEHICLE" | "BIKE_PARK" | "BIKE_LANE";

// Issue tags for structured feedback categorization
export type FeedbackTag =
  | "OVERCROWDED"
  | "LATE"
  | "DIRTY"
  | "ACCESSIBILITY"
  | "SAFETY"
  | "BROKEN_INFRASTRUCTURE"
  | "FREQUENCY"
  | "ROUTE_COVERAGE";

export const FEEDBACK_TAGS: FeedbackTag[] = [
  "OVERCROWDED",
  "LATE",
  "DIRTY",
  "ACCESSIBILITY",
  "SAFETY",
  "BROKEN_INFRASTRUCTURE",
  "FREQUENCY",
  "ROUTE_COVERAGE",
];

export type ReportReason = "SPAM" | "OFFENSIVE" | "MISLEADING" | "OTHER";

export interface FeedbackMetadata {
  lineContext?: string; // routeShortName the vehicle was on when rated
}

export type FeedbackStatus = "OPEN" | "ACKNOWLEDGED" | "UNDER_REVIEW" | "PLANNED_FIX" | "RESOLVED";

export interface OperatorResponse {
  status: FeedbackStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  targetId: string;
  rating: number;
  comment: string | null;
  metadata: FeedbackMetadata | null;
  tags: FeedbackTag[];
  createdAt: string;
  updatedAt: string;
  status?: FeedbackStatus;
  voteCount?: number;
  userVoted?: boolean;
  userReported?: boolean;
  authorBadges?: string[]; // BadgeId[]
  operatorResponse?: OperatorResponse | null;
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
  tags?: FeedbackTag[];
}

// Transit check-in types

export type TransitMode = "BUS" | "METRO" | "BIKE";

export interface CheckInStats {
  total: number;
  byMode: Record<TransitMode, number>;
  todayTotal: number;
}

export interface CheckInItem {
  id: string;
  mode: TransitMode;
  targetId: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ActiveCheckIn {
  mode: TransitMode;
  targetId: string | null;
  lat: number | null;
  lon: number | null;
  count: number;
}

export interface ActiveCheckInsResponse {
  checkIns: ActiveCheckIn[];
  total: number;
  todayTotal: number;
}

// Proposal types

export type ProposalType = "BIKE_LANE" | "STOP" | "LINE";
export type ProposalStatus = "OPEN" | "UNDER_REVIEW" | "CLOSED" | "ARCHIVED";

// GeoJSON geometry stored with proposals (LineString, MultiLineString, or Point)
export interface ProposalGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString" | "MultiLineString" | "Point" | "Polygon";
      coordinates: number[] | number[][] | number[][][];
    };
    properties: Record<string, unknown>;
  }>;
}

export interface ProposalItem {
  id: string;
  type: ProposalType;
  title: string;
  description: string;
  targetId: string | null;
  linkUrl: string | null;
  geometry: ProposalGeoJSON | null;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  voteCount: number;
  userVoted: boolean;
  userReported: boolean;
  isOwner: boolean;
}

export interface ProposalListResponse {
  proposals: ProposalItem[];
  total: number;
}

export interface ProposalCreateRequest {
  type: ProposalType;
  title: string;
  description: string;
  targetId?: string;
  linkUrl?: string;
  geometry?: ProposalGeoJSON;
}
