import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../../helpers/mock-prisma";

import { GET } from "@/app/api/feedback/summary/route";
import { NextRequest } from "next/server";

function makeRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/feedback/summary");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

describe("GET /api/feedback/summary", () => {
  beforeEach(() => resetMocks());

  it("returns 400 when type is missing", async () => {
    const req = makeRequest({ targetIds: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required parameters");
  });

  it("returns 400 when targetIds is missing", async () => {
    const req = makeRequest({ type: "STOP" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    const req = makeRequest({ type: "INVALID", targetIds: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid type");
  });

  it("returns 400 when targetIds is empty", async () => {
    const req = makeRequest({ type: "STOP", targetIds: "" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than 100 targetIds", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id${i}`).join(",");
    const req = makeRequest({ type: "STOP", targetIds: ids });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Maximum 100");
  });

  it("returns batch summaries for multiple targetIds", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([
      { targetId: "2:BRRS2", _avg: { rating: 4.2 }, _count: { rating: 15 } },
      { targetId: "2:ABCDE", _avg: { rating: 3.8 }, _count: { rating: 7 } },
    ]);

    const req = makeRequest({ type: "STOP", targetIds: "2:BRRS2,2:ABCDE" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data["2:BRRS2"]).toEqual({ avg: 4.2, count: 15 });
    expect(data["2:ABCDE"]).toEqual({ avg: 3.8, count: 7 });
  });

  it("sets Cache-Control header to 60s", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([]);

    const req = makeRequest({ type: "STOP", targetIds: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("s-maxage=60");
  });

  it("returns empty object when no feedback exists", async () => {
    mockPrisma.feedback.groupBy.mockResolvedValue([]);

    const req = makeRequest({ type: "LINE", targetIds: "205,206" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({});
  });
});
