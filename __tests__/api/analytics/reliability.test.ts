import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";
import { GET } from "@/app/api/analytics/reliability/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/analytics/reliability");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const perfRow = (
  overrides: Partial<{
    route: string;
    directionId: number;
    date: Date;
    tripsObserved: number;
    tripsScheduled: number | null;
    canceledTrips: number | null;
    excessWaitTimeSecs: number | null;
    headwayAdherencePct: number | null;
    avgCommercialSpeed: number | null;
    bunchingPct: number | null;
    gappingPct: number | null;
    canceledPct: number | null;
  }> = {}
) => ({
  route: "205",
  directionId: 0,
  date: new Date("2026-02-25"),
  tripsObserved: 80,
  tripsScheduled: null,
  canceledTrips: null,
  excessWaitTimeSecs: 120,
  headwayAdherencePct: 75,
  avgCommercialSpeed: 14,
  bunchingPct: 10,
  gappingPct: 5,
  canceledPct: null,
  ...overrides,
});

describe("GET /api/analytics/reliability", () => {
  beforeEach(() => resetMocks());

  it("returns empty rankings when no data", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rankings).toHaveLength(0);
    expect(data.networkEwt).toBeNull();
    expect(data.networkCanceledPct).toBeNull();
  });

  it("aggregates directions into a single route ranking", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow({ directionId: 0, tripsObserved: 40, excessWaitTimeSecs: 100 }),
      perfRow({ directionId: 1, tripsObserved: 40, excessWaitTimeSecs: 140 }),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.rankings).toHaveLength(1);
    expect(data.rankings[0].route).toBe("205");
    expect(data.rankings[0].trips).toBe(80);
    // avg EWT = (100+140)/2 = 120
    expect(data.rankings[0].ewt).toBe(120);
  });

  it("computes networkCanceledPct as weighted ratio (not avg of pcts)", async () => {
    // route 205: 5 canceled / 100 scheduled = 5%
    // route 206: 1 canceled / 1000 scheduled = 0.1%
    // weighted: 6/1100 = 0.5% — NOT avg(5%, 0.1%) = 2.55%
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow({ route: "205", tripsScheduled: 100, canceledTrips: 5, canceledPct: 5.0 }),
      perfRow({ route: "206", tripsScheduled: 1000, canceledTrips: 1, canceledPct: 0.1 }),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    // 6/1100 = 0.545...% → rounded to 0.5
    expect(data.networkCanceledPct).toBe(0.5);
  });

  it("computes per-route canceledPct as weighted ratio across days/directions", async () => {
    // dir 0: 4 canceled / 80 scheduled; dir 1: 6 canceled / 120 scheduled
    // weighted: 10/200 = 5% — NOT avg(5%, 5%) which happens to be same here
    // Use asymmetric case: dir 0: 2/100=2%, dir 1: 18/100=18% → 20/200=10%
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow({ directionId: 0, tripsScheduled: 100, canceledTrips: 2, canceledPct: 2.0 }),
      perfRow({ directionId: 1, tripsScheduled: 100, canceledTrips: 18, canceledPct: 18.0 }),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.rankings[0].canceledPct).toBe(10);
  });

  it("sets canceledPct to null when no snapshot data for route", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow({ route: "205", tripsScheduled: null, canceledTrips: null, canceledPct: null }),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.rankings[0].canceledPct).toBeNull();
    expect(data.networkCanceledPct).toBeNull();
  });

  it("computes networkEwt as average across all routes", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow({ route: "205", excessWaitTimeSecs: 60 }),
      perfRow({ route: "206", excessWaitTimeSecs: 180 }),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.networkEwt).toBe(120);
  });

  it("sets Cache-Control header", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
  });

  it("returns 500 on db error", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockRejectedValue(new Error("db down"));
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(500);
  });
});
