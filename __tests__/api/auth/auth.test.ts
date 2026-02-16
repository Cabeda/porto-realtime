import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, mockGetSession, resetMocks } from "../../helpers/mock-prisma";

// Must import after mock setup
import { GET, POST } from "@/app/api/feedback/route";
import { NextRequest } from "next/server";

function makeGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/feedback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("Feedback route with Neon Auth session", () => {
  beforeEach(() => resetMocks());

  it("GET uses session user for userFeedback when authenticated", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const userFeedback = {
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 5,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockPrisma.feedback.findMany.mockResolvedValue([]);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.findFirst.mockResolvedValue(userFeedback);

    const req = makeGetRequest({ type: "STOP", targetId: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.userFeedback).toEqual(userFeedback);
  });

  it("GET returns null userFeedback when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    mockPrisma.feedback.findMany.mockResolvedValue([]);
    mockPrisma.feedback.count.mockResolvedValue(0);

    const req = makeGetRequest({ type: "STOP", targetId: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.userFeedback).toBeNull();
  });

  it("POST creates feedback for authenticated user", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const mockUser = { id: "app-user-1", email: "test@example.com" };
    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "Great stop",
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "Great stop",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should upsert user by email
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@example.com" },
      })
    );
  });

  it("POST returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toContain("Authentication required");
  });
});
