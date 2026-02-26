import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock fetchWithRetry
const mockFetchWithRetry = vi.fn();
vi.mock("@/lib/api-fetch", () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
  ClientError: class ClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock simulate
const mockGetSimulatedBuses = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/simulate", () => ({
  getSimulatedBuses: (...args: unknown[]) => mockGetSimulatedBuses(...args),
}));

// Import AFTER mocks are set up
import { parseAnnotations, buildRouteDestinationMap } from "@/app/api/buses/route";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/buses");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

// Minimal valid FIWARE entity that passes Zod validation
function makeFiwareEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: "urn:ngsi-ld:Vehicle:porto:stcp:701:1234",
    type: "Vehicle",
    location: {
      type: "geo:json",
      value: { type: "Point", coordinates: [-8.61, 41.15] },
    },
    routeShortName: { type: "Text", value: "701" },
    routeLongName: { type: "Text", value: "Bolhão - Codiceira" },
    heading: { type: "Number", value: 180 },
    speed: { type: "Number", value: 25 },
    dateModified: { type: "DateTime", value: "2024-06-15T10:00:00Z" },
    vehicleNumber: { type: "Text", value: "STCP 3456" },
    annotations: {
      type: "StructuredValue",
      value: ["stcp:sentido:0", "stcp:nr_viagem:99"],
    },
    ...overrides,
  };
}

// Mock OTP routes response
const mockOTPRoutesResponse = {
  data: {
    routes: [
      {
        gtfsId: "1:701",
        shortName: "701",
        longName: "Bolhão - Codiceira",
        patterns: [
          { headsign: "Codiceira", directionId: 1 },
          { headsign: "Bolhão", directionId: 0 },
        ],
      },
    ],
  },
};

/**
 * The GET handler calls fetchRouteDestinations() first (OTP), then fetches FIWARE.
 * fetchRouteDestinations has an in-memory 24h cache. After the first call succeeds,
 * subsequent calls within the same test run reuse the cache and skip the OTP fetch.
 *
 * We need to re-import the module for each test to reset the module-level cache,
 * OR accept that after the first test, only 1 mock is needed (FIWARE only).
 *
 * Strategy: use `vi.resetModules()` + dynamic import to get fresh module state.
 */
async function freshGET() {
  vi.resetModules();

  // Re-apply mocks after module reset
  vi.doMock("@/lib/api-fetch", () => ({
    fetchWithRetry: (...args: unknown[]) => mockFetchWithRetry(...args),
    ClientError: class ClientError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.status = status;
      }
    },
  }));
  vi.doMock("@/lib/simulate", () => ({
    getSimulatedBuses: (...args: unknown[]) => mockGetSimulatedBuses(...args),
  }));

  const mod = await import("@/app/api/buses/route");
  return mod.GET;
}

function mockFetchResponses(fiwareData: unknown[], otpData = mockOTPRoutesResponse) {
  mockFetchWithRetry
    // First call: OTP routes (fetchRouteDestinations)
    .mockResolvedValueOnce({
      json: () => Promise.resolve(otpData),
    } as Response)
    // Second call: FIWARE entities
    .mockResolvedValueOnce({
      json: () => Promise.resolve(fiwareData),
    } as Response);
}

beforeEach(() => {
  mockFetchWithRetry.mockReset();
  mockGetSimulatedBuses.mockReset().mockResolvedValue([]);
});

describe("parseAnnotations", () => {
  it("maps sentido:0 directly to directionId 0", () => {
    const result = parseAnnotations(["stcp:sentido:0", "stcp:nr_viagem:12345"]);
    expect(result.directionId).toBe(0);
    expect(result.tripId).toBe("12345");
  });

  it("maps sentido:1 directly to directionId 1", () => {
    const result = parseAnnotations(["stcp:sentido:1"]);
    expect(result.directionId).toBe(1);
  });

  it("returns null directionId when no sentido annotation", () => {
    const result = parseAnnotations(["stcp:nr_viagem:99"]);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("99");
  });

  it("returns defaults for empty annotations", () => {
    const result = parseAnnotations([]);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("");
  });

  it("returns defaults for undefined annotations", () => {
    const result = parseAnnotations(undefined);
    expect(result.directionId).toBeNull();
    expect(result.tripId).toBe("");
  });

  it("handles non-string annotations gracefully", () => {
    const result = parseAnnotations([123 as unknown as string, "stcp:sentido:0"]);
    expect(result.directionId).toBe(0);
  });

  it("handles sentido with no digit match", () => {
    const result = parseAnnotations(["stcp:sentido:abc"]);
    expect(result.directionId).toBeNull();
  });
});

describe("buildRouteDestinationMap", () => {
  it("maps directions to headsigns", () => {
    const map = buildRouteDestinationMap([
      {
        shortName: "701",
        patterns: [
          { headsign: "Codiceira", directionId: 1 },
          { headsign: "Bolhão", directionId: 0 },
        ],
      },
    ]);
    const entry = map.get("701")!;
    expect(entry.directionHeadsigns.get(0)).toEqual(["Bolhão"]);
    expect(entry.directionHeadsigns.get(1)).toEqual(["Codiceira"]);
    expect(entry.destinations).toContain("Bolhão");
    expect(entry.destinations).toContain("Codiceira");
  });

  it("skips routes with no headsigns", () => {
    const map = buildRouteDestinationMap([
      { shortName: "999", patterns: [{ headsign: null, directionId: 0 }] },
    ]);
    expect(map.has("999")).toBe(false);
  });

  it("deduplicates headsigns within same direction", () => {
    const map = buildRouteDestinationMap([
      {
        shortName: "701",
        patterns: [
          { headsign: "Codiceira", directionId: 1 },
          { headsign: "Codiceira", directionId: 1 },
        ],
      },
    ]);
    expect(map.get("701")!.directionHeadsigns.get(1)).toEqual(["Codiceira"]);
  });

  it("returns empty map for empty routes", () => {
    expect(buildRouteDestinationMap([]).size).toBe(0);
  });
});

describe("GET /api/buses", () => {
  it("returns buses from FIWARE entities", async () => {
    const GET = await freshGET();
    mockFetchResponses([makeFiwareEntity()]);

    const res = await GET(makeRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.buses).toHaveLength(1);
    expect(data.buses[0].routeShortName).toBe("701");
    expect(data.buses[0].lat).toBe(41.15);
    expect(data.buses[0].lon).toBe(-8.61);
  });

  it("sets cache headers on success", async () => {
    const GET = await freshGET();
    mockFetchResponses([makeFiwareEntity()]);

    const res = await GET(makeRequest());
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=10");
    expect(res.headers.get("X-Response-Time")).toBeTruthy();
  });

  it("extracts vehicle number from STCP format", async () => {
    const GET = await freshGET();
    mockFetchResponses([makeFiwareEntity({ vehicleNumber: { type: "Text", value: "STCP 3456" } })]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].vehicleNumber).toBe("3456");
  });

  it("extracts heading and speed", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        heading: { type: "Number", value: 90 },
        speed: { type: "Number", value: 30 },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].heading).toBe(90);
    expect(data.buses[0].speed).toBe(30);
  });

  it("falls back to route field when routeShortName is missing", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        routeShortName: { type: "Text", value: "" },
        route: { type: "Text", value: "502" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].routeShortName).toBe("502");
  });

  it("falls back to lineId when routeShortName and route are missing", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        routeShortName: { type: "Text", value: "" },
        route: { type: "Text", value: "" },
        lineId: { type: "Text", value: "ZR" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].routeShortName).toBe("ZR");
  });

  it("falls back to line when other route fields are missing", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        routeShortName: { type: "Text", value: "" },
        route: { type: "Text", value: "" },
        lineId: { type: "Text", value: "" },
        line: { type: "Text", value: "200" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].routeShortName).toBe("200");
  });

  it("extracts route from vehicleId STCP pattern", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        routeShortName: { type: "Text", value: "" },
        route: { type: "Text", value: "" },
        lineId: { type: "Text", value: "" },
        line: { type: "Text", value: "" },
        vehiclePlateIdentifier: { type: "Text", value: "STCP 701" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].routeShortName).toBe("701");
  });

  it("extracts route from entity id parts", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        id: "urn:ngsi-ld:Vehicle:porto:stcp:502:bus1234",
        routeShortName: { type: "Text", value: "" },
        route: { type: "Text", value: "" },
        lineId: { type: "Text", value: "" },
        line: { type: "Text", value: "" },
        vehiclePlateIdentifier: { type: "Text", value: "" },
        vehicleNumber: { type: "Text", value: "" },
        license_plate: { type: "Text", value: "" },
        name: { type: "Text", value: "" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].routeShortName).toBe("502");
  });

  it("filters out entities with no valid location", async () => {
    const GET = await freshGET();
    // Entity with no location at all — fails the raw data filter
    const invalidEntity = {
      id: "urn:ngsi-ld:Vehicle:bad",
      type: "Vehicle",
    };
    mockFetchResponses([makeFiwareEntity(), invalidEntity]);

    const res = await GET(makeRequest());
    const data = await res.json();
    // Only the valid entity should appear
    expect(data.buses).toHaveLength(1);
    expect(data.buses[0].id).toBe("urn:ngsi-ld:Vehicle:porto:stcp:701:1234");
  });

  it("handles FIWARE validation failure with non-array data", async () => {
    const GET = await freshGET();
    mockFetchResponses("not an array" as unknown as unknown[]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.buses).toEqual([]);
  });

  it("returns 500 on complete fetch failure", async () => {
    const GET = await freshGET();
    // Both OTP and FIWARE fail
    mockFetchWithRetry.mockRejectedValue(new Error("Network error"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Failed to fetch bus data");
  });

  it("resolves destination from OTP route cache", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        routeLongName: { type: "Text", value: "" },
        destination: { type: "Text", value: "" },
        tripHeadsign: { type: "Text", value: "" },
        headsign: { type: "Text", value: "" },
        direction: { type: "Text", value: "" },
        directionId: { type: "Text", value: "" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    // Direction 0 from annotations → "Bolhão"
    expect(data.buses[0].routeLongName).toBe("Bolhão");
  });

  it("injects simulated buses when simulate param is set", async () => {
    const GET = await freshGET();
    mockFetchResponses([makeFiwareEntity()]);
    mockGetSimulatedBuses.mockResolvedValueOnce([
      {
        id: "sim-1",
        lat: 41.16,
        lon: -8.62,
        routeShortName: "SIM",
        routeLongName: "Simulated",
        heading: 0,
        speed: 20,
        lastUpdated: "2024-01-01T00:00:00Z",
        vehicleNumber: "SIM001",
        tripId: "sim-trip",
      },
    ]);

    const res = await GET(makeRequest({ simulate: "701,502" }));
    const data = await res.json();
    expect(data.buses.length).toBeGreaterThanOrEqual(2);
    expect(mockGetSimulatedBuses).toHaveBeenCalledWith(["701", "502"]);
  });

  it("returns empty buses for empty FIWARE response", async () => {
    const GET = await freshGET();
    mockFetchResponses([]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.buses).toEqual([]);
  });

  it("uses bearing when heading is missing", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        heading: { type: "Number", value: 0 },
        bearing: { type: "Number", value: 270 },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    // heading is 0 (falsy), so falls back to bearing
    expect(data.buses[0].heading).toBe(270);
  });

  it("uses timestamp when dateModified is missing", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        dateModified: { type: "DateTime", value: "" },
        timestamp: { type: "DateTime", value: "2024-01-01T12:00:00Z" },
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].lastUpdated).toBe("2024-01-01T12:00:00Z");
  });

  it("falls back to entity id for vehicle number", async () => {
    const GET = await freshGET();
    mockFetchResponses([
      makeFiwareEntity({
        vehiclePlateIdentifier: { type: "Text", value: "" },
        vehicleNumber: { type: "Text", value: "" },
        license_plate: { type: "Text", value: "" },
        name: { type: "Text", value: "" },
        id: "urn:ngsi-ld:Vehicle:porto:stcp:701:BUS99",
      }),
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.buses[0].vehicleNumber).toBe("BUS99");
  });

  it("handles OTP route fetch failure gracefully", async () => {
    const GET = await freshGET();
    // OTP fails, then FIWARE succeeds
    mockFetchWithRetry.mockRejectedValueOnce(new Error("OTP down")).mockResolvedValueOnce({
      json: () => Promise.resolve([makeFiwareEntity()]),
    } as Response);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.buses).toHaveLength(1);
  });
});
