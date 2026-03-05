import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";
import { GET } from "@/app/api/analytics/line/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/analytics/line");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const perfRow = (
  date: string,
  overrides: Partial<{
    canceledPct: number | null;
    excessWaitTimeSecs: number | null;
    headwayAdherencePct: number | null;
    avgCommercialSpeed: number | null;
    bunchingPct: number | null;
    gappingPct: number | null;
    tripsObserved: number;
  }> = {}
) => ({
  date: new Date(date),
  tripsObserved: 80,
  excessWaitTimeSecs: 120,
  headwayAdherencePct: 75,
  avgCommercialSpeed: 14,
  bunchingPct: 10,
  gappingPct: 5,
  canceledPct: null,
  ...overrides,
});

describe("GET /api/analytics/line (view=summary)", () => {
  beforeEach(() => resetMocks());

  it("returns 400 when route param is missing", async () => {
    const res = await GET(makeRequest({ view: "summary" }));
    expect(res.status).toBe(400);
  });

  it("returns avgCanceledPct null when no snapshot data", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-24", { canceledPct: null }),
      perfRow("2026-02-25", { canceledPct: null }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.avgCanceledPct).toBeNull();
  });

  it("computes avgCanceledPct as mean of non-null values", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-24", { canceledPct: 4.0 }),
      perfRow("2026-02-25", { canceledPct: 6.0 }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    expect(data.avgCanceledPct).toBe(5);
  });

  it("ignores null canceledPct rows when computing average", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-23", { canceledPct: null }),
      perfRow("2026-02-24", { canceledPct: 3.0 }),
      perfRow("2026-02-25", { canceledPct: 7.0 }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    // avg of [3.0, 7.0] = 5.0, null row excluded
    expect(data.avgCanceledPct).toBe(5);
  });

  it("includes canceledPct per day in dailyPerformance", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-24", { canceledPct: 2.5 }),
      perfRow("2026-02-25", { canceledPct: null }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    expect(data.dailyPerformance[0].canceledPct).toBe(2.5);
    expect(data.dailyPerformance[1].canceledPct).toBeNull();
  });

  it("returns empty dailyPerformance when no data", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    expect(data.dailyPerformance).toHaveLength(0);
    expect(data.avgCanceledPct).toBeNull();
    expect(data.totalTrips).toBe(0);
  });
});
