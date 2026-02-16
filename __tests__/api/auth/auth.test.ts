import { describe, it, expect, beforeEach, vi } from "vitest";
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
      "x-forwarded-for": "127.0.0.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("Feedback route with Neon Auth session", () => {
  beforeEach(() => resetMocks());

  it("GET uses session user for userFeedback when authenticated", async () => {
    // Simulate authenticated session
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

    // Should query by session user ID, not anonymous ID
    expect(mockPrisma.feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "neon-user-1",
        }),
      })
    );
  });

  it("GET falls back to anonymous ID when no session", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    mockPrisma.feedback.findMany.mockResolvedValue([]);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.findFirst.mockResolvedValue(null);

    const req = makeGetRequest(
      { type: "STOP", targetId: "2:BRRS2" },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    // Should query by anonymous ID
    expect(mockPrisma.feedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { anonId: VALID_UUID },
        }),
      })
    );
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

  it("POST falls back to anonymous ID when no session", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    const mockUser = { id: "anon-user-1", anonId: VALID_UUID };
    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should upsert user by anonId
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { anonId: VALID_UUID },
      })
    );
  });

  it("POST returns 401 when no session and no anonymous ID", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": "" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST returns 401 for invalid UUID in x-anonymous-id", async () => {
    mockGetSession.mockResolvedValue({ data: null });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": "not-a-uuid" }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST prefers session over anonymous ID when both present", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const mockUser = { id: "app-user-1", email: "test@example.com" };
    mockPrisma.user.upsert.mockResolvedValue(mockUser);
    // Linking: no anonymous user found for this anonId
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should use email (session), not anonId
    expect(mockPrisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@example.com" },
      })
    );
  });
});

describe("Anonymous-to-authenticated review linking", () => {
  beforeEach(() => resetMocks());

  it("transfers anonymous feedback to authenticated user on first auth submission", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const authUser = { id: "auth-user-1" };
    const anonUser = { id: "anon-user-1" };
    mockPrisma.user.upsert.mockResolvedValue(authUser);
    mockPrisma.user.findUnique.mockResolvedValue(anonUser);

    // Anonymous user has one feedback that doesn't conflict
    mockPrisma.feedback.findMany.mockResolvedValue([
      { id: "anon-fb-1", type: "LINE", targetId: "205" },
    ]);
    // No conflict — auth user doesn't have feedback for LINE/205
    mockPrisma.feedback.findFirst.mockResolvedValue(null);
    mockPrisma.feedback.update.mockResolvedValue({});
    mockPrisma.user.delete.mockResolvedValue({});

    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb-new",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 5,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 5 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should look up anonymous user
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { anonId: VALID_UUID },
      })
    );

    // Should transfer the anonymous feedback to the auth user
    expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
      where: { id: "anon-fb-1" },
      data: { userId: "auth-user-1" },
    });

    // Should delete the anonymous user
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: "anon-user-1" },
    });
  });

  it("deletes conflicting anonymous feedback instead of transferring", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const authUser = { id: "auth-user-1" };
    const anonUser = { id: "anon-user-1" };
    mockPrisma.user.upsert.mockResolvedValue(authUser);
    mockPrisma.user.findUnique.mockResolvedValue(anonUser);

    // Anonymous user has feedback that conflicts with auth user's existing feedback
    mockPrisma.feedback.findMany.mockResolvedValue([
      { id: "anon-fb-1", type: "STOP", targetId: "2:BRRS2" },
    ]);
    // Conflict — auth user already has feedback for STOP/2:BRRS2
    mockPrisma.feedback.findFirst.mockResolvedValue({ id: "auth-fb-1" });
    mockPrisma.feedback.delete.mockResolvedValue({});
    mockPrisma.user.delete.mockResolvedValue({});

    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "auth-fb-1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 3,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 3 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should delete the conflicting anonymous feedback
    expect(mockPrisma.feedback.delete).toHaveBeenCalledWith({
      where: { id: "anon-fb-1" },
    });

    // Should NOT transfer (update) the anonymous feedback
    expect(mockPrisma.feedback.update).not.toHaveBeenCalled();

    // Should delete the anonymous user
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: "anon-user-1" },
    });
  });

  it("skips linking when no anonymous user exists for the anonId", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const authUser = { id: "auth-user-1" };
    mockPrisma.user.upsert.mockResolvedValue(authUser);
    // No anonymous user found
    mockPrisma.user.findUnique.mockResolvedValue(null);

    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should not attempt any feedback transfer or user deletion
    expect(mockPrisma.feedback.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.feedback.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("still succeeds if linking fails (best-effort)", async () => {
    mockGetSession.mockResolvedValue({
      data: {
        user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
        session: { id: "sess-1" },
      },
    });

    const authUser = { id: "auth-user-1" };
    mockPrisma.user.upsert.mockResolvedValue(authUser);
    // Linking throws an error
    mockPrisma.user.findUnique.mockRejectedValue(new Error("DB connection lost"));

    mockPrisma.feedback.count.mockResolvedValue(0);
    mockPrisma.feedback.upsert.mockResolvedValue({
      id: "fb1",
      type: "STOP",
      targetId: "2:BRRS2",
      rating: 4,
      comment: null,
      metadata: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const req = makePostRequest(
      { type: "STOP", targetId: "2:BRRS2", rating: 4 },
      { "x-anonymous-id": VALID_UUID }
    );
    const res = await POST(req);
    // Should still succeed — linking is best-effort
    expect(res.status).toBe(200);
  });
});
