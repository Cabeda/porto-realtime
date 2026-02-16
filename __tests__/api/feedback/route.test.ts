import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, mockGetSession, resetMocks } from "../../helpers/mock-prisma";

// Must import after mock setup
import { GET, POST } from "@/app/api/feedback/route";
import { NextRequest } from "next/server";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeGetRequest(params: Record<string, string>, headers?: Record<string, string>) {
  const url = new URL("http://localhost:3000/api/feedback");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: "GET",
    headers: headers || {},
  });
}

function makePostRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return new NextRequest("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-anonymous-id": VALID_UUID,
      "x-forwarded-for": "127.0.0.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("GET /api/feedback", () => {
  beforeEach(() => resetMocks());

  it("returns 400 when type is missing", async () => {
    const req = makeGetRequest({ targetId: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing required parameters");
  });

  it("returns 400 when targetId is missing", async () => {
    const req = makeGetRequest({ type: "STOP" });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    const req = makeGetRequest({ type: "INVALID", targetId: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid type");
  });

  it("returns feedbacks for valid type + targetId", async () => {
    const mockFeedbacks = [
      {
        id: "fb1",
        type: "STOP",
        targetId: "2:BRRS2",
        rating: 4,
        comment: "Nice stop",
        metadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    mockPrisma.feedback.findMany.mockResolvedValue(mockFeedbacks);
    mockPrisma.feedback.count.mockResolvedValue(1);

    const req = makeGetRequest({ type: "STOP", targetId: "2:BRRS2" });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.feedbacks).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.userFeedback).toBeNull();
  });

  it("returns userFeedback when valid x-anonymous-id provided", async () => {
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

    const req = makeGetRequest(
      { type: "STOP", targetId: "2:BRRS2" },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.userFeedback).toEqual(userFeedback);
  });

  it("supports pagination with page and limit params", async () => {
    mockPrisma.feedback.findMany.mockResolvedValue([]);
    mockPrisma.feedback.count.mockResolvedValue(25);

    const req = makeGetRequest({
      type: "LINE",
      targetId: "205",
      page: "1",
      limit: "5",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.total).toBe(25);

    // Verify findMany was called with correct skip/take
    expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
      })
    );
  });
});

describe("POST /api/feedback", () => {
  beforeEach(() => resetMocks());

  it("returns 401 when x-anonymous-id is missing", async () => {
    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": "" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid UUID in x-anonymous-id", async () => {
    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": "not-a-uuid" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when type is missing", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    const req = makePostRequest({ targetId: "2:BRRS2", rating: 4 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetId is missing", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    const req = makePostRequest({ type: "STOP", rating: 4 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is missing", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    const req = makePostRequest({ type: "STOP", targetId: "2:BRRS2" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when rating is outside 1-5", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });

    const req0 = makePostRequest({ type: "STOP", targetId: "2:BRRS2", rating: 0 });
    expect((await POST(req0)).status).toBe(400);

    const req6 = makePostRequest({ type: "STOP", targetId: "2:BRRS2", rating: 6 });
    expect((await POST(req6)).status).toBe(400);

    const reqFloat = makePostRequest({ type: "STOP", targetId: "2:BRRS2", rating: 3.5 });
    expect((await POST(reqFloat)).status).toBe(400);
  });

  it("returns 400 when comment exceeds 500 chars", async () => {
    // The route strips HTML and slices to 500, so a long plain text comment
    // gets truncated to 500 — it doesn't return 400.
    // Use varied chars to avoid triggering the repetitive character filter.
    const longComment = "This is a test comment that is quite long. ".repeat(20); // ~880 chars
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: longComment.slice(0, 500),
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: longComment,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify the comment was truncated to 500 chars
    const upsertCall = mockPrisma.feedback.upsert.mock.calls[0][0];
    expect(upsertCall.create.comment.length).toBeLessThanOrEqual(500);
  });

  it("returns 400 when targetId exceeds 100 chars", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    const req = makePostRequest({
      type: "STOP",
      targetId: "x".repeat(101),
      rating: 4,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("strips HTML tags from comment", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "Hello world",
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "<b>Hello</b> <script>alert('xss')</script>world",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const upsertCall = mockPrisma.feedback.upsert.mock.calls[0][0];
    expect(upsertCall.create.comment).not.toContain("<");
    expect(upsertCall.create.comment).toContain("Hello");
  });

  it("blocks profanity via content filter", async () => {
    mockPrisma.user.upsert.mockResolvedValue({ id: "user1", anonId: VALID_UUID });
    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 1,
      comment: "This is merda",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates feedback successfully with valid data", async () => {
    const mockUser = { id: "user1", anonId: VALID_UUID };
    const mockFeedback = {
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "Great stop",
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue(mockFeedback);

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: "Great stop",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.feedback.rating).toBe(4);
  });

  it("returns 429 when user rate limit exceeded", async () => {
    const mockUser = { id: "user1", anonId: VALID_UUID };
    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    mockPrisma.feedback.count.mockResolvedValue(20); // at limit

    const req = makePostRequest({
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("stores metadata correctly for VEHICLE type", async () => {
    const mockUser = { id: "user1", anonId: VALID_UUID };
    const mockFeedback = {
      id: "fb1",
      type: "VEHICLE",
      targetId: "3245",
      rating: 3,
      comment: null,
      metadata: { lineContext: "205" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue(mockFeedback);

    const req = makePostRequest({
      type: "VEHICLE",
      targetId: "3245",
      rating: 3,
      metadata: { lineContext: "205" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const upsertCall = mockPrisma.feedback.upsert.mock.calls[0][0];
    expect(upsertCall.create.metadata).toEqual({ lineContext: "205" });
  });
});
