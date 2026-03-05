import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";
import { GET } from "@/app/api/analytics/cancellations/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/analytics/cancellations");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const perfRow = (route: string, scheduled: number, canceled: number, pct: number) => ({
  route,
  tripsObserved: scheduled - canceled,
  tripsScheduled: scheduled,
  canceledTrips: canceled,
  canceledPct: pct,
});

describe("GET /api/analytics/cancellations", () => {
  beforeEach(() => resetMocks());

  it("returns null networkCanceledPct when no rows have tripsScheduled", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([]);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.networkCanceledPct).toBeNull();
    expect(data.totalScheduled).toBe(0);
    expect(data.totalCanceled).toBe(0);
    expect(data.routes).toHaveLength(0);
  });

  it("computes networkCanceledPct correctly across routes", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("205", 100, 5, 5.0),
      perfRow("206", 200, 10, 5.0),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // 15 canceled / 300 scheduled = 5%
    expect(data.networkCanceledPct).toBe(5);
    expect(data.totalScheduled).toBe(300);
    expect(data.totalCanceled).toBe(15);
  });

  it("combines directions for the same route", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      { route: "205", tripsObserved: 45, tripsScheduled: 50, canceledTrips: 5, canceledPct: 10 },
      { route: "205", tripsObserved: 45, tripsScheduled: 50, canceledTrips: 5, canceledPct: 10 },
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.routes).toHaveLength(1);
    expect(data.routes[0].route).toBe("205");
    expect(data.routes[0].tripsScheduled).toBe(100);
    expect(data.routes[0].canceledTrips).toBe(10);
    expect(data.routes[0].canceledPct).toBe(10);
  });

  it("sorts routes by canceledPct descending", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([
      perfRow("205", 100, 2, 2.0),
      perfRow("207", 100, 8, 8.0),
      perfRow("206", 100, 5, 5.0),
    ]);
    const res = await GET(makeRequest({ period: "7d" }));
    const data = await res.json();
    expect(data.routes.map((r: { route: string }) => r.route)).toEqual(["207", "206", "205"]);
  });

  it("accepts date param", async () => {
    mockPrisma.routePerformanceDaily.findMany.mockResolvedValue([perfRow("205", 50, 3, 6.0)]);
    const res = await GET(makeRequest({ date: "2026-02-25" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.period).toBe("2026-02-25");
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
