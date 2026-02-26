import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";

import { GET } from "@/app/api/feedback/rankings/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/feedback/rankings");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/feedback/rankings", () => {
  beforeEach(() => resetMocks());

  it("returns 400 when type is missing", async () => {
    const req = makeRequest({});
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required parameter: type");
  });

  it("returns 400 for invalid type", async () => {
    const req = makeRequest({ type: "INVALID" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid type");
  });

  it("returns ranked list sorted by count (default)", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([
      { targetId: "205", _avg: { rating: 4.5 }, _count: { rating: 20 } },
      { targetId: "206", _avg: { rating: 3.2 }, _count: { rating: 10 } },
    ]);
    mockPrisma.feedback.findMany.mockResolvedValue([
      {
        targetId: "205",
        rating: 5,
        comment: "Great line",
        metadata: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const req = makeRequest({ type: "LINE" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.rankings).toHaveLength(2);
    expect(data.rankings[0].targetId).toBe("205");
    expect(data.rankings[0].avg).toBe(4.5);
    expect(data.rankings[0].count).toBe(20);
    expect(data.totalTargets).toBe(2);
  });

  it("returns single-target detail with distribution", async () => {
    mockPrisma.feedback.groupBy
      .mockResolvedValueOnce([{ targetId: "205", _avg: { rating: 4.0 }, _count: { rating: 50 } }])
      .mockResolvedValueOnce([
        { rating: 1, _count: { rating: 2 } },
        { rating: 2, _count: { rating: 3 } },
        { rating: 3, _count: { rating: 10 } },
        { rating: 4, _count: { rating: 15 } },
        { rating: 5, _count: { rating: 20 } },
      ]);

    const req = makeRequest({ type: "LINE", targetId: "205" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.targetId).toBe("205");
    expect(data.avg).toBe(4.0);
    expect(data.count).toBe(50);
    expect(data.distribution).toEqual([2, 3, 10, 15, 20]);
  });

  it("returns recent comments for ranked targets", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([
      { targetId: "205", _avg: { rating: 4.0 }, _count: { rating: 10 } },
    ]);
    mockPrisma.feedback.findMany.mockResolvedValue([
      {
        targetId: "205",
        rating: 5,
        comment: "Excellent service",
        metadata: null,
        createdAt: new Date().toISOString(),
      },
      {
        targetId: "205",
        rating: 4,
        comment: "Pretty good",
        metadata: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const req = makeRequest({ type: "LINE" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.rankings[0].recentComments).toHaveLength(2);
    expect(data.rankings[0].recentComments[0].comment).toBe("Excellent service");
  });

  it("sets Cache-Control header", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([]);
    mockPrisma.feedback.findMany.mockResolvedValue([]);

    const req = makeRequest({ type: "STOP" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("s-maxage=60");
  });
});
