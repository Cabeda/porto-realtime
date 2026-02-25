import { describe, it, expect } from "vitest";
import {
  OTPStopSchema,
  OTPStopsResponseSchema,
  OTPRouteBriefSchema,
  OTPRoutesResponseSchema,
  OTPRouteSimpleSchema,
  OTPRoutesSimpleResponseSchema,
  OTPPatternGeometrySchema,
  OTPPatternWithGeometrySchema,
  OTPRouteWithPatternsSchema,
  OTPRouteShapesResponseSchema,
  OTPStoptimeSchema,
  OTPStationDeparturesResponseSchema,
  OTPLineStopSchema,
  OTPLinePatternSchema,
  OTPLineRouteSchema,
  OTPLineResponseSchema,
} from "@/lib/schemas/otp";

describe("OTPStopSchema", () => {
  it("parses a valid stop", () => {
    const result = OTPStopSchema.safeParse({
      id: "stop-1",
      code: "S1",
      desc: "Main stop",
      lat: 41.15,
      lon: -8.61,
      name: "Bolhão",
      gtfsId: "2:BRRS2",
      vehicleMode: "BUS",
    });
    expect(result.success).toBe(true);
  });

  it("allows nullable optional fields", () => {
    const result = OTPStopSchema.safeParse({
      id: "stop-1",
      lat: 41.15,
      lon: -8.61,
      name: "Bolhão",
      gtfsId: "2:BRRS2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = OTPStopSchema.safeParse({ id: "stop-1" });
    expect(result.success).toBe(false);
  });
});

describe("OTPStopsResponseSchema", () => {
  it("parses a valid stops response", () => {
    const result = OTPStopsResponseSchema.safeParse({
      data: {
        stops: [{ id: "s1", lat: 41.15, lon: -8.61, name: "Bolhão", gtfsId: "2:BRRS2" }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses empty stops array", () => {
    const result = OTPStopsResponseSchema.safeParse({ data: { stops: [] } });
    expect(result.success).toBe(true);
  });
});

describe("OTPRouteBriefSchema", () => {
  it("parses a valid route with patterns", () => {
    const result = OTPRouteBriefSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: "Bolhão - Codiceira",
      patterns: [{ headsign: "Codiceira", directionId: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("allows null longName", () => {
    const result = OTPRouteBriefSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: null,
      patterns: [],
    });
    expect(result.success).toBe(true);
  });

  it("allows null headsign in patterns", () => {
    const result = OTPRouteBriefSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: null,
      patterns: [{ headsign: null, directionId: 0 }],
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPRoutesResponseSchema", () => {
  it("parses a valid routes response", () => {
    const result = OTPRoutesResponseSchema.safeParse({
      data: {
        routes: [
          {
            gtfsId: "1:701",
            shortName: "701",
            longName: "Bolhão - Codiceira",
            patterns: [{ headsign: "Codiceira", directionId: 1 }],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPRouteSimpleSchema", () => {
  it("parses a valid simple route", () => {
    const result = OTPRouteSimpleSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: "Bolhão - Codiceira",
      mode: "BUS",
      color: "FF0000",
    });
    expect(result.success).toBe(true);
  });

  it("allows null/missing optional fields", () => {
    const result = OTPRouteSimpleSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: null,
      mode: "BUS",
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPRoutesSimpleResponseSchema", () => {
  it("parses a valid simple routes response", () => {
    const result = OTPRoutesSimpleResponseSchema.safeParse({
      data: {
        routes: [{ gtfsId: "1:701", shortName: "701", longName: null, mode: "BUS" }],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPPatternGeometrySchema", () => {
  it("parses valid geometry", () => {
    const result = OTPPatternGeometrySchema.safeParse({
      length: 42,
      points: "encodedPolyline",
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPPatternWithGeometrySchema", () => {
  it("parses pattern with geometry", () => {
    const result = OTPPatternWithGeometrySchema.safeParse({
      id: "p1",
      headsign: "Codiceira",
      directionId: 1,
      patternGeometry: { length: 42, points: "abc" },
    });
    expect(result.success).toBe(true);
  });

  it("allows null patternGeometry", () => {
    const result = OTPPatternWithGeometrySchema.safeParse({
      id: "p1",
      directionId: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPRouteWithPatternsSchema", () => {
  it("parses route with patterns", () => {
    const result = OTPRouteWithPatternsSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: "Bolhão - Codiceira",
      patterns: [{ id: "p1", directionId: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("allows null patterns", () => {
    const result = OTPRouteWithPatternsSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPRouteShapesResponseSchema", () => {
  it("parses a valid route shapes response", () => {
    const result = OTPRouteShapesResponseSchema.safeParse({
      data: {
        routes: [
          {
            gtfsId: "1:701",
            shortName: "701",
            longName: null,
            patterns: [
              {
                id: "p1",
                headsign: "Codiceira",
                directionId: 1,
                patternGeometry: { length: 10, points: "abc" },
              },
            ],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPStoptimeSchema", () => {
  const validStoptime = {
    realtimeState: "UPDATED",
    realtimeDeparture: 36000,
    scheduledDeparture: 35900,
    realtimeArrival: 35950,
    scheduledArrival: 35850,
    arrivalDelay: 100,
    departureDelay: 100,
    realtime: true,
    serviceDay: 1718409600,
    headsign: "Codiceira",
    trip: {
      gtfsId: "1:701:1",
      pattern: { code: "p1", id: "pattern-1" },
      route: {
        gtfsId: "1:701",
        shortName: "701",
        longName: "Bolhão - Codiceira",
        mode: "BUS",
        color: null,
        id: "route-1",
      },
      id: "trip-1",
    },
  };

  it("parses a valid stoptime", () => {
    const result = OTPStoptimeSchema.safeParse(validStoptime);
    expect(result.success).toBe(true);
  });

  it("allows null headsign", () => {
    const result = OTPStoptimeSchema.safeParse({ ...validStoptime, headsign: null });
    expect(result.success).toBe(true);
  });

  it("rejects missing trip", () => {
    const { trip: _, ...noTrip } = validStoptime;
    const result = OTPStoptimeSchema.safeParse(noTrip);
    expect(result.success).toBe(false);
  });
});

describe("OTPStationDeparturesResponseSchema", () => {
  it("parses a valid departures response", () => {
    const result = OTPStationDeparturesResponseSchema.safeParse({
      data: {
        stop: {
          id: "stop-1",
          name: "Bolhão",
          stoptimesWithoutPatterns: [],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("allows null stop", () => {
    const result = OTPStationDeparturesResponseSchema.safeParse({
      data: { stop: null },
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPLineStopSchema", () => {
  it("parses a valid line stop", () => {
    const result = OTPLineStopSchema.safeParse({
      gtfsId: "2:BRRS2",
      name: "Bolhão",
      lat: 41.15,
      lon: -8.61,
      code: "BRRS2",
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPLinePatternSchema", () => {
  it("parses a valid line pattern", () => {
    const result = OTPLinePatternSchema.safeParse({
      id: "p1",
      headsign: "Codiceira",
      directionId: 1,
      stops: [{ gtfsId: "2:BRRS2", name: "Bolhão", lat: 41.15, lon: -8.61 }],
      patternGeometry: { length: 10, points: "abc" },
    });
    expect(result.success).toBe(true);
  });

  it("allows null patternGeometry", () => {
    const result = OTPLinePatternSchema.safeParse({
      id: "p1",
      directionId: 0,
      stops: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPLineRouteSchema", () => {
  it("parses a valid line route", () => {
    const result = OTPLineRouteSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: "Bolhão - Codiceira",
      patterns: [
        {
          id: "p1",
          headsign: "Codiceira",
          directionId: 1,
          stops: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("allows null patterns", () => {
    const result = OTPLineRouteSchema.safeParse({
      gtfsId: "1:701",
      shortName: "701",
      longName: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("OTPLineResponseSchema", () => {
  it("parses a valid line response", () => {
    const result = OTPLineResponseSchema.safeParse({
      data: {
        routes: [
          {
            gtfsId: "1:701",
            shortName: "701",
            longName: "Bolhão - Codiceira",
            patterns: [],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses empty routes", () => {
    const result = OTPLineResponseSchema.safeParse({
      data: { routes: [] },
    });
    expect(result.success).toBe(true);
  });
});
