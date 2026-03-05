import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, mockGetSession, resetMocks } from "../../helpers/mock-prisma";

import { POST } from "@/app/api/feedback/vote/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/feedback/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

function mockAuthenticatedSession() {
  mockGetSession.mockResolvedValue({
    data: {
      user: { id: "neon-user-1", email: "test@example.com", name: "Test" },
      session: { id: "sess-1" },
    },
  });
  mockPrisma.user.upsert.mockResolvedValue({ id: "user1", email: "test@example.com" });
}

describe("POST /api/feedback/vote", () => {
  beforeEach(() => resetMocks());

  it("returns 401 when not authenticated", async () => {
    const req = makeRequest({ feedbackId: "fb1" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Authentication required");
  });

  it("returns 400 when feedbackId is missing", async () => {
    mockAuthenticatedSession();
    const req = makeRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("feedbackId is required");
  });

  it("returns 400 when feedbackId is not a string", async () => {
    mockAuthenticatedSession();
    const req = makeRequest({ feedbackId: 123 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when feedback does not exist", async () => {
    mockAuthenticatedSession();
    mockPrisma.feedback.findUnique.mockResolvedValue(null);
    const req = makeRequest({ feedbackId: "nonexistent" });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Feedback not found");
  });

  it("adds a vote when none exists (voted=true)", async () => {
    mockAuthenticatedSession();
    mockPrisma.feedback.findUnique.mockResolvedValue({ id: "fb1", userId: "other-user" });
    mockPrisma.feedbackVote.findUnique.mockResolvedValue(null);
    mockPrisma.feedbackVote.create.mockResolvedValue({
      id: "vote1",
      userId: "user1",
      feedbackId: "fb1",
    });
    mockPrisma.feedbackVote.count.mockResolvedValue(1);

    const req = makeRequest({ feedbackId: "fb1" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voted).toBe(true);
    expect(data.voteCount).toBe(1);
    expect(mockPrisma.feedbackVote.create).toHaveBeenCalledOnce();
    expect(mockPrisma.feedbackVote.delete).not.toHaveBeenCalled();
  });

  it("removes a vote when one exists (voted=false)", async () => {
    mockAuthenticatedSession();
    mockPrisma.feedback.findUnique.mockResolvedValue({ id: "fb1", userId: "other-user" });
    mockPrisma.feedbackVote.findUnique.mockResolvedValue({
      id: "vote1",
      userId: "user1",
      feedbackId: "fb1",
    });
    mockPrisma.feedbackVote.delete.mockResolvedValue({ id: "vote1" });
    mockPrisma.feedbackVote.count.mockResolvedValue(0);

    const req = makeRequest({ feedbackId: "fb1" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.voted).toBe(false);
    expect(data.voteCount).toBe(0);
    expect(mockPrisma.feedbackVote.delete).toHaveBeenCalledOnce();
    expect(mockPrisma.feedbackVote.create).not.toHaveBeenCalled();
  });

  it("returns updated voteCount after toggling", async () => {
    mockAuthenticatedSession();
    mockPrisma.feedback.findUnique.mockResolvedValue({ id: "fb1", userId: "other-user" });
    mockPrisma.feedbackVote.findUnique.mockResolvedValue(null);
    mockPrisma.feedbackVote.create.mockResolvedValue({ id: "vote1" });
    mockPrisma.feedbackVote.count.mockResolvedValue(5);

    const req = makeRequest({ feedbackId: "fb1" });
    const res = await POST(req);
    const data = await res.json();
    expect(data.voteCount).toBe(5);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuthenticatedSession();
    const req = new NextRequest("http://localhost:3000/api/feedback/vote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });
});
