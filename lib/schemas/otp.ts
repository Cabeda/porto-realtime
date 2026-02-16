import { z } from "zod";

/**
 * Zod schemas for OTP (OpenTripPlanner) GraphQL API responses.
 *
 * These validate the JSON responses from the Porto OTP endpoint
 * and ensure the app handles malformed data gracefully.
 */

// --- Stops ---

export const OTPStopSchema = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  desc: z.string().nullable().optional(),
  lat: z.number(),
  lon: z.number(),
  name: z.string(),
  gtfsId: z.string(),
  vehicleMode: z.string().nullable().optional(),
});

export const OTPStopsResponseSchema = z.object({
  data: z.object({
    stops: z.array(OTPStopSchema),
  }),
});

// --- Routes ---

export const OTPPatternBriefSchema = z.object({
  headsign: z.string().nullable().optional(),
  directionId: z.number(),
});

export const OTPRouteBriefSchema = z.object({
  gtfsId: z.string(),
  shortName: z.string(),
  longName: z.string(),
  patterns: z.array(OTPPatternBriefSchema),
});

export const OTPRoutesResponseSchema = z.object({
  data: z.object({
    routes: z.array(OTPRouteBriefSchema),
  }),
});

// --- Route list (simple, for /api/routes) ---

export const OTPRouteSimpleSchema = z.object({
  gtfsId: z.string(),
  shortName: z.string(),
  longName: z.string(),
  mode: z.string(),
});

export const OTPRoutesSimpleResponseSchema = z.object({
  data: z.object({
    routes: z.array(OTPRouteSimpleSchema),
  }),
});

// --- Route shapes (patterns with geometry) ---

export const OTPPatternGeometrySchema = z.object({
  length: z.number(),
  points: z.string(),
});

export const OTPPatternWithGeometrySchema = z.object({
  id: z.string(),
  headsign: z.string().nullable().optional(),
  directionId: z.number(),
  patternGeometry: OTPPatternGeometrySchema.nullable().optional(),
});

export const OTPRouteWithPatternsSchema = z.object({
  gtfsId: z.string(),
  shortName: z.string(),
  longName: z.string(),
  patterns: z.array(OTPPatternWithGeometrySchema).nullable().optional(),
});

export const OTPRouteShapesResponseSchema = z.object({
  data: z.object({
    routes: z.array(OTPRouteWithPatternsSchema),
  }),
});

// --- Station departures ---

export const OTPTripRouteSchema = z.object({
  gtfsId: z.string(),
  shortName: z.string(),
  longName: z.string(),
  mode: z.string(),
  color: z.string().nullable().optional(),
  id: z.string(),
});

export const OTPTripPatternSchema = z.object({
  code: z.string(),
  id: z.string(),
});

export const OTPTripSchema = z.object({
  gtfsId: z.string(),
  pattern: OTPTripPatternSchema,
  route: OTPTripRouteSchema,
  id: z.string(),
});

export const OTPStoptimeSchema = z.object({
  realtimeState: z.string(),
  realtimeDeparture: z.number(),
  scheduledDeparture: z.number(),
  realtimeArrival: z.number(),
  scheduledArrival: z.number(),
  arrivalDelay: z.number(),
  departureDelay: z.number(),
  realtime: z.boolean(),
  serviceDay: z.number(),
  headsign: z.string().nullable().optional(),
  trip: OTPTripSchema,
});

export const OTPStationDeparturesResponseSchema = z.object({
  data: z.object({
    stop: z
      .object({
        id: z.string(),
        name: z.string(),
        stoptimesWithoutPatterns: z.array(OTPStoptimeSchema),
      })
      .nullable(),
  }),
});

// --- Line info (for /api/line) ---

export const OTPLineStopSchema = z.object({
  gtfsId: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  code: z.string().nullable().optional(),
});

export const OTPLinePatternSchema = z.object({
  id: z.string(),
  headsign: z.string().nullable().optional(),
  directionId: z.number(),
  stops: z.array(OTPLineStopSchema),
  patternGeometry: z
    .object({
      length: z.number(),
      points: z.string(),
    })
    .nullable()
    .optional(),
});

export const OTPLineRouteSchema = z.object({
  gtfsId: z.string(),
  shortName: z.string(),
  longName: z.string(),
  patterns: z.array(OTPLinePatternSchema).nullable().optional(),
});

export const OTPLineResponseSchema = z.object({
  data: z.object({
    routes: z.array(OTPLineRouteSchema),
  }),
});

// Export inferred types
export type OTPStop = z.infer<typeof OTPStopSchema>;
export type OTPStoptime = z.infer<typeof OTPStoptimeSchema>;
export type OTPRouteWithPatterns = z.infer<typeof OTPRouteWithPatternsSchema>;
export type OTPLineRoute = z.infer<typeof OTPLineRouteSchema>;
