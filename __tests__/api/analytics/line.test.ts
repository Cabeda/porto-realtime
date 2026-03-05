import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";
import { GET } from "@/app/api/analytics/line/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/analytics/line");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

// The route handler derives canceledPct from tripsScheduled - tripsObserved
const perfRow = (
  date: string,
  overrides: Partial<{
    tripsScheduled: number | null;
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
  tripsScheduled: null as number | null,
  excessWaitTimeSecs: 120,
  headwayAdherencePct: 75,
  avgCommercialSpeed: 14,
  bunchingPct: 10,
  gappingPct: 5,
  ...overrides,
});

describe("GET /api/analytics/line (view=summary)", () => {
  beforeEach(() => resetMocks());

  it("returns 400 when route param is missing", async () => {
    const res = await GET(makeRequest({ view: "summary" }));
    expect(res.status).toBe(400);
  });

  it("returns avgCanceledPct null when no tripsScheduled data", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-24", { tripsScheduled: null }),
      perfRow("2026-02-25", { tripsScheduled: null }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.avgCanceledPct).toBeNull();
  });

  it("computes avgCanceledPct from tripsScheduled - tripsObserved", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      // 4% canceled: (100-96)/100
      perfRow("2026-02-24", { tripsScheduled: 100, tripsObserved: 96 }),
      // 6% canceled: (100-94)/100
      perfRow("2026-02-25", { tripsScheduled: 100, tripsObserved: 94 }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    expect(data.avgCanceledPct).toBe(5);
  });

  it("ignores rows without tripsScheduled when computing avgCanceledPct", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("2026-02-23", { tripsScheduled: null }),
      // 3% canceled: (100-97)/100
      perfRow("2026-02-24", { tripsScheduled: 100, tripsObserved: 97 }),
      // 7% canceled: (100-93)/100
      perfRow("2026-02-25", { tripsScheduled: 100, tripsObserved: 93 }),
    ]);
    mockPrisma.tripLog.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest({ route: "205", view: "summary", period: "7d" }));
    const data = await res.json();
    // avg of [3.0, 7.0] = 5.0, null row excluded
    expect(data.avgCanceledPct).toBe(5);
  });

  it("includes canceledPct per day in dailyPerformance", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      // 2.5% canceled: (200-195)/200 = 2.5%
      perfRow("2026-02-24", { tripsScheduled: 200, tripsObserved: 195 }),
      perfRow("2026-02-25", { tripsScheduled: null }),
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
